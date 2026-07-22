// Covers both new business-data modules in one file, at the path explicitly
// requested for this task: src/lib/data/apiKeys.ts and
// src/lib/data/ledgers.ts. This deliberately departs from this project's
// established test-location convention (co-located src/lib/**/*.test.ts,
// e.g. src/lib/data/projects.test.ts) and from its one-module-per-test-file
// pattern — flagged rather than silently "corrected," since the requested
// path was explicit. Both conventions still work here: Vitest's default
// include pattern isn't restricted to src/, and vitest.config.ts's coverage
// exclude already matches any `**/*.test.ts` regardless of location.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// server-only unconditionally throws unless the bundler declares the
// "react-server" export condition, which Vitest's Node/Vite resolution
// never does — both modules under test import it.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    encryptedApiKey: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    paymentLedger: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  createTenantApiKey,
  getDecryptedApiKey,
  getTenantApiKeys,
  revokeTenantApiKey,
} from "@/lib/data/apiKeys";
import { getTenantLedger, getUserLedger, recordTenantPayment } from "@/lib/data/ledgers";
import { prisma } from "@/lib/prisma";

const mockedFindManyKeys = vi.mocked(prisma.encryptedApiKey.findMany);
const mockedFindFirstKey = vi.mocked(prisma.encryptedApiKey.findFirst);
const mockedCreateKey = vi.mocked(prisma.encryptedApiKey.create);
const mockedUpdateManyKeys = vi.mocked(prisma.encryptedApiKey.updateMany);
const mockedUpdateKey = vi.mocked(prisma.encryptedApiKey.update);
const mockedFindManyLedger = vi.mocked(prisma.paymentLedger.findMany);
const mockedTransaction = vi.mocked(prisma.$transaction);

// A real, valid 32-byte AES-256 key, base64-encoded — encryption itself is
// never mocked in this suite. Node's `crypto` is pure and local, so letting
// it actually run makes the "is this really encrypted" assertions below
// meaningful instead of tautological.
const TEST_ENCRYPTION_SECRET = Buffer.from("a".repeat(32)).toString("base64");

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const USER_1 = "user_abc123";

// Isolation lifecycle note (per this task's own testing contract): every
// mock above is either a fresh vi.fn() reset via .mockReset() in beforeEach,
// or a one-time .mockResolvedValueOnce()/.mockImplementationOnce() that
// self-expires — nothing here uses vi.restoreAllMocks()/vi.resetAllMocks(),
// which would also strip the vi.mock() factory bindings above (that exact
// bug, and why it's avoided, is documented in
// src/app/api/webhooks/clerk/route.test.ts).
let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("API_KEY_ENCRYPTION_SECRET", TEST_ENCRYPTION_SECRET);
  mockedFindManyKeys.mockReset();
  mockedFindFirstKey.mockReset();
  mockedCreateKey.mockReset();
  mockedUpdateManyKeys.mockReset();
  mockedUpdateKey.mockReset();
  mockedFindManyLedger.mockReset();
  mockedTransaction.mockReset();
  // apiKeys.ts logs each operation for attribution (see its own comments on
  // why userId is logged rather than filtered on) — suppressed here to keep
  // test output clean, restored individually below rather than via
  // vi.restoreAllMocks(), which would also strip the vi.mock() factory
  // bindings above.
  consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  // getDecryptedApiKey() logs (not throws) if the best-effort lastUsedAt
  // update fails — suppressed the same way, for the same reason.
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleInfoSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

describe("apiKeys.ts", () => {
  function buildApiKeyRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "key-1",
      tenantId: TENANT_A,
      provider: "anthropic",
      label: "Production key",
      maskedKey: "sk-ant-••••••••wq7A",
      status: "ACTIVE",
      encryptedKey: "ciphertext.authtag",
      encryptionIv: "iv-value",
      createdAt: new Date("2026-05-03"),
      lastUsedAt: null,
      ...overrides,
    };
  }

  describe("getTenantApiKeys", () => {
    it("scopes the query to the given tenantId only, ordered by createdAt desc", async () => {
      mockedFindManyKeys.mockResolvedValueOnce([]);

      await getTenantApiKeys(TENANT_A, USER_1);

      expect(mockedFindManyKeys).toHaveBeenCalledWith({
        where: { tenantId: TENANT_A },
        orderBy: { createdAt: "desc" },
      });
    });

    it("never queries by a different tenant's id", async () => {
      mockedFindManyKeys.mockResolvedValueOnce([]);

      await getTenantApiKeys(TENANT_A, USER_1);

      const callArgs = mockedFindManyKeys.mock.calls[0][0];
      expect(callArgs?.where).toMatchObject({ tenantId: TENANT_A });
      expect(callArgs?.where).not.toMatchObject({ tenantId: TENANT_B });
    });

    it("returns an empty dataset for a tenant with no keys", async () => {
      mockedFindManyKeys.mockResolvedValueOnce([]);

      const result = await getTenantApiKeys(TENANT_A, USER_1);

      expect(result).toEqual([]);
    });

    it("maps status casing from Prisma's uppercase enum to the frontend's lowercase type", async () => {
      mockedFindManyKeys.mockResolvedValueOnce([
        buildApiKeyRow({ status: "ACTIVE" }),
        buildApiKeyRow({ id: "key-2", status: "REVOKED" }),
      ] as never);

      const result = await getTenantApiKeys(TENANT_A, USER_1);

      expect(result[0].status).toBe("active");
      expect(result[1].status).toBe("revoked");
    });

    it("throws on an unrecognized status value from the database, rather than mistyping the row", async () => {
      mockedFindManyKeys.mockResolvedValueOnce([buildApiKeyRow({ status: "EXPIRED" })] as never);

      await expect(getTenantApiKeys(TENANT_A, USER_1)).rejects.toThrow(/Unrecognized API key status/);
    });

    it("maps a null lastUsedAt through as null, not a formatted date", async () => {
      mockedFindManyKeys.mockResolvedValueOnce([buildApiKeyRow({ lastUsedAt: null })] as never);

      const result = await getTenantApiKeys(TENANT_A, USER_1);

      expect(result[0].lastUsedAt).toBeNull();
    });

    it("converts a real lastUsedAt to an ISO date string", async () => {
      mockedFindManyKeys.mockResolvedValueOnce([
        buildApiKeyRow({ lastUsedAt: new Date("2026-07-18") }),
      ] as never);

      const result = await getTenantApiKeys(TENANT_A, USER_1);

      expect(result[0].lastUsedAt).toBe("2026-07-18");
    });

    it("throws on an unrecognized provider value rather than passing it through", async () => {
      mockedFindManyKeys.mockResolvedValueOnce([buildApiKeyRow({ provider: "azure" })] as never);

      await expect(getTenantApiKeys(TENANT_A, USER_1)).rejects.toThrow(/Unrecognized API key provider/);
    });
  });

  describe("createTenantApiKey", () => {
    it("scopes the created row to the given tenantId", async () => {
      mockedCreateKey.mockResolvedValueOnce(buildApiKeyRow({ tenantId: TENANT_A }) as never);

      await createTenantApiKey(TENANT_A, USER_1, "anthropic", "My key", "sk-ant-api03-realsecretvalue123456");

      expect(mockedCreateKey).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT_A }) }),
      );
    });

    it("never persists the raw key material in encryptedKey — it must actually be ciphertext", async () => {
      mockedCreateKey.mockResolvedValueOnce(buildApiKeyRow() as never);
      const rawKey = "sk-ant-api03-realsecretvalue123456";

      await createTenantApiKey(TENANT_A, USER_1, "anthropic", "My key", rawKey);

      const callArgs = mockedCreateKey.mock.calls[0][0] as { data: { encryptedKey: string; encryptionIv: string } };
      expect(callArgs.data.encryptedKey).not.toContain(rawKey);
      expect(callArgs.data.encryptedKey).not.toBe(rawKey);
      // ciphertext.authTag — both base64 segments present, per the encoding
      // documented in apiKeys.ts (no separate authTag column exists).
      expect(callArgs.data.encryptedKey.split(".")).toHaveLength(2);
      expect(callArgs.data.encryptionIv).toBeTruthy();
    });

    it("produces a masked key that reveals only the last 4 characters of the real secret", async () => {
      mockedCreateKey.mockResolvedValueOnce(buildApiKeyRow() as never);
      const rawKey = "sk-ant-api03-realsecretvalue123456";

      await createTenantApiKey(TENANT_A, USER_1, "anthropic", "My key", rawKey);

      const callArgs = mockedCreateKey.mock.calls[0][0] as { data: { maskedKey: string } };
      expect(callArgs.data.maskedKey.endsWith(rawKey.slice(-4))).toBe(true);
      expect(callArgs.data.maskedKey).not.toBe(rawKey);
      expect(callArgs.data.maskedKey).not.toContain(rawKey.slice(7, -4));
    });

    it("masks a short key (too short to show both a prefix and a suffix) with only the last 4 characters", async () => {
      mockedCreateKey.mockResolvedValueOnce(buildApiKeyRow() as never);
      const shortRawKey = "abc12345"; // 8 chars — at or below the prefix+suffix threshold

      await createTenantApiKey(TENANT_A, USER_1, "anthropic", "My key", shortRawKey);

      const callArgs = mockedCreateKey.mock.calls[0][0] as { data: { maskedKey: string } };
      expect(callArgs.data.maskedKey).toBe(`••••••••${shortRawKey.slice(-4)}`);
      expect(callArgs.data.maskedKey).not.toContain(shortRawKey.slice(0, 4));
    });

    it("always inserts with an initial status of ACTIVE", async () => {
      mockedCreateKey.mockResolvedValueOnce(buildApiKeyRow() as never);

      await createTenantApiKey(TENANT_A, USER_1, "openai", "My key", "sk-realsecretvalue123456");

      expect(mockedCreateKey).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
      );
    });

    it("throws when rawKeyMaterial is empty or blank", async () => {
      await expect(createTenantApiKey(TENANT_A, USER_1, "anthropic", "My key", "   ")).rejects.toThrow(
        /must not be empty/,
      );
      expect(mockedCreateKey).not.toHaveBeenCalled();
    });

    it("throws a clear, debuggable error when the encryption secret is not configured", async () => {
      vi.stubEnv("API_KEY_ENCRYPTION_SECRET", "");

      await expect(
        createTenantApiKey(TENANT_A, USER_1, "anthropic", "My key", "sk-ant-realsecret"),
      ).rejects.toThrow(/API_KEY_ENCRYPTION_SECRET is not set/);
      expect(mockedCreateKey).not.toHaveBeenCalled();
    });

    it("throws when the encryption secret does not decode to exactly 32 bytes", async () => {
      vi.stubEnv("API_KEY_ENCRYPTION_SECRET", Buffer.from("too-short").toString("base64"));

      await expect(
        createTenantApiKey(TENANT_A, USER_1, "anthropic", "My key", "sk-ant-realsecret"),
      ).rejects.toThrow(/exactly 32 bytes/);
    });
  });

  describe("revokeTenantApiKey", () => {
    it("scopes the update to both id and tenantId together", async () => {
      mockedUpdateManyKeys.mockResolvedValueOnce({ count: 1 });

      await revokeTenantApiKey(TENANT_A, USER_1, "key-1");

      expect(mockedUpdateManyKeys).toHaveBeenCalledWith({
        where: { id: "key-1", tenantId: TENANT_A },
        data: { status: "REVOKED" },
      });
    });

    it("drops the mutation and throws when the key belongs to a different tenant", async () => {
      // Simulates the real-world case: apiKeyId is real, but it belongs to
      // TENANT_B — the combined { id, tenantId } where clause matches zero
      // rows, so Postgres performs no update at all (not a partial/wrong
      // update — a dropped one), and count comes back 0.
      mockedUpdateManyKeys.mockResolvedValueOnce({ count: 0 });

      await expect(revokeTenantApiKey(TENANT_B, USER_1, "key-1")).rejects.toThrow(
        /was not found for tenant/,
      );
    });

    it("throws when the apiKeyId does not exist at all", async () => {
      mockedUpdateManyKeys.mockResolvedValueOnce({ count: 0 });

      await expect(revokeTenantApiKey(TENANT_A, USER_1, "nonexistent-key")).rejects.toThrow(
        /was not found for tenant/,
      );
    });

    it("succeeds silently (resolves with no value) when exactly one row matches", async () => {
      mockedUpdateManyKeys.mockResolvedValueOnce({ count: 1 });

      await expect(revokeTenantApiKey(TENANT_A, USER_1, "key-1")).resolves.toBeUndefined();
    });
  });

  describe("getDecryptedApiKey", () => {
    // Helper: runs the real createTenantApiKey() to get a genuinely
    // encrypted { encryptedKey, encryptionIv } pair, rather than
    // hand-constructing a fixture — encryptKeyMaterial() is private to
    // apiKeys.ts, and a real round-trip (encrypt via one exported function,
    // decrypt via another) is a stronger test than a fabricated ciphertext
    // could ever be.
    async function encryptRealKey(rawKey: string) {
      mockedCreateKey.mockResolvedValueOnce(buildApiKeyRow() as never);
      await createTenantApiKey(TENANT_A, USER_1, "anthropic", "My key", rawKey);
      const callArgs = mockedCreateKey.mock.calls.at(-1)?.[0] as {
        data: { encryptedKey: string; encryptionIv: string };
      };
      return callArgs.data;
    }

    it("scopes the lookup to id, tenantId, and ACTIVE status together", async () => {
      mockedFindFirstKey.mockResolvedValueOnce(null);

      await getDecryptedApiKey(TENANT_A, "key-1");

      expect(mockedFindFirstKey).toHaveBeenCalledWith({
        where: { id: "key-1", tenantId: TENANT_A, status: "ACTIVE" },
      });
    });

    it("returns null rather than throwing when the key belongs to a different tenant", async () => {
      // The combined where clause (id + tenantId + status) is what makes
      // this resolve to null instead of the real row when TENANT_B is
      // passed for a key that actually belongs to TENANT_A.
      mockedFindFirstKey.mockResolvedValueOnce(null);

      const result = await getDecryptedApiKey(TENANT_B, "key-1");

      expect(result).toBeNull();
      expect(mockedUpdateKey).not.toHaveBeenCalled();
    });

    it("returns null for a nonexistent key", async () => {
      mockedFindFirstKey.mockResolvedValueOnce(null);

      const result = await getDecryptedApiKey(TENANT_A, "nonexistent-key");

      expect(result).toBeNull();
    });

    it("decrypts back to the exact original raw key material that was encrypted", async () => {
      const rawKey = "sk-ant-api03-realsecretvalue123456";
      const { encryptedKey, encryptionIv } = await encryptRealKey(rawKey);
      mockedFindFirstKey.mockResolvedValueOnce(buildApiKeyRow({ encryptedKey, encryptionIv }) as never);
      mockedUpdateKey.mockResolvedValueOnce({} as never);

      const decrypted = await getDecryptedApiKey(TENANT_A, "key-1");

      expect(decrypted).toBe(rawKey);
    });

    it("updates lastUsedAt after a successful decrypt", async () => {
      const { encryptedKey, encryptionIv } = await encryptRealKey("sk-test-key-12345678");
      mockedFindFirstKey.mockResolvedValueOnce(buildApiKeyRow({ encryptedKey, encryptionIv }) as never);
      mockedUpdateKey.mockResolvedValueOnce({} as never);

      await getDecryptedApiKey(TENANT_A, "key-1");

      expect(mockedUpdateKey).toHaveBeenCalledWith({
        where: { id: "key-1" },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it("still returns the decrypted key even if the lastUsedAt tracking update fails", async () => {
      const rawKey = "sk-test-key-12345678";
      const { encryptedKey, encryptionIv } = await encryptRealKey(rawKey);
      mockedFindFirstKey.mockResolvedValueOnce(buildApiKeyRow({ encryptedKey, encryptionIv }) as never);
      mockedUpdateKey.mockRejectedValueOnce(new Error("db unavailable"));

      const decrypted = await getDecryptedApiKey(TENANT_A, "key-1");

      expect(decrypted).toBe(rawKey);
    });

    it("throws when the stored ciphertext has been tampered with (GCM auth tag mismatch)", async () => {
      const { encryptionIv } = await encryptRealKey("sk-test-key-12345678");
      const tamperedCiphertext = `${Buffer.from("tampered").toString("base64")}.${Buffer.from("badtag1234567890123456").toString("base64")}`;
      mockedFindFirstKey.mockResolvedValueOnce(
        buildApiKeyRow({ encryptedKey: tamperedCiphertext, encryptionIv }) as never,
      );

      await expect(getDecryptedApiKey(TENANT_A, "key-1")).rejects.toThrow();
    });

    it("throws a clear format error when encryptedKey has no '.' separator at all", async () => {
      mockedFindFirstKey.mockResolvedValueOnce(
        buildApiKeyRow({ encryptedKey: "no-separator-here", encryptionIv: "irrelevant" }) as never,
      );

      await expect(getDecryptedApiKey(TENANT_A, "key-1")).rejects.toThrow(/not in the expected/);
    });
  });
});

describe("ledgers.ts", () => {
  function buildLedgerRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "ledger-1",
      tenantId: TENANT_A,
      propertyId: "prop-1",
      userId: USER_1,
      amount: 1000,
      amountPaid: 0,
      dueDate: new Date("2000-01-01"), // far in the past — unambiguously "overdue" whenever this runs
      isDelayed: false, // stale/irrelevant stored value — the mapper must never trust this
      penaltyAmount: 0,
      status: "PENDING",
      createdAt: new Date("1999-12-01"),
      updatedAt: new Date("1999-12-01"),
      ...overrides,
    };
  }

  const FAR_FUTURE = new Date("2099-01-01");
  const FAR_PAST = new Date("2000-01-01");

  describe("getTenantLedger", () => {
    it("scopes the query to the given tenantId, ordered by dueDate ascending", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([]);

      await getTenantLedger(TENANT_A);

      expect(mockedFindManyLedger).toHaveBeenCalledWith({
        where: { tenantId: TENANT_A },
        orderBy: { dueDate: "asc" },
      });
    });

    it("never queries by a different tenant's id", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([]);

      await getTenantLedger(TENANT_A);

      const callArgs = mockedFindManyLedger.mock.calls[0][0];
      expect(callArgs?.where).toMatchObject({ tenantId: TENANT_A });
      expect(callArgs?.where).not.toMatchObject({ tenantId: TENANT_B });
    });

    it("returns an empty dataset for a tenant with no installments", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([]);

      const result = await getTenantLedger(TENANT_A);

      expect(result).toEqual([]);
    });

    it("throws on an unrecognized status value from the database, rather than mistyping the row", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([buildLedgerRow({ status: "CANCELLED" })] as never);

      await expect(getTenantLedger(TENANT_A)).rejects.toThrow(/Unrecognized payment ledger status/);
    });

    it("computes isDelayed true for a non-PAID row whose due date has passed", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([
        buildLedgerRow({ status: "PENDING", dueDate: FAR_PAST, isDelayed: false }),
      ] as never);

      const result = await getTenantLedger(TENANT_A);

      expect(result[0].isDelayed).toBe(true);
    });

    it("computes isDelayed false for a non-PAID row whose due date is still in the future", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([
        buildLedgerRow({ status: "PENDING", dueDate: FAR_FUTURE }),
      ] as never);

      const result = await getTenantLedger(TENANT_A);

      expect(result[0].isDelayed).toBe(false);
    });

    it("computes isDelayed false for a PAID row even with a past due date", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([
        buildLedgerRow({ status: "PAID", dueDate: FAR_PAST, isDelayed: true }),
      ] as never);

      const result = await getTenantLedger(TENANT_A);

      // The stored is_delayed column says true here on purpose — the
      // mapper must override it with a fresh computation, not trust it.
      expect(result[0].isDelayed).toBe(false);
    });

    it("computes isDelayed true for an OVERDUE row past its due date", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([
        buildLedgerRow({ status: "OVERDUE", dueDate: FAR_PAST }),
      ] as never);

      const result = await getTenantLedger(TENANT_A);

      expect(result[0].isDelayed).toBe(true);
    });
  });

  describe("getUserLedger", () => {
    const USER_2 = "user_other456";

    it("scopes the query to both tenantId and userId together", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([]);

      await getUserLedger(TENANT_A, USER_1);

      expect(mockedFindManyLedger).toHaveBeenCalledWith({
        where: { tenantId: TENANT_A, userId: USER_1 },
        orderBy: { dueDate: "asc" },
      });
    });

    it("never returns another user's installments, even within the same tenant", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([]);

      await getUserLedger(TENANT_A, USER_1);

      const callArgs = mockedFindManyLedger.mock.calls[0][0];
      expect(callArgs?.where).toMatchObject({ userId: USER_1 });
      expect(callArgs?.where).not.toMatchObject({ userId: USER_2 });
    });

    it("returns an empty dataset for a user with no installments", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([]);

      const result = await getUserLedger(TENANT_A, USER_1);

      expect(result).toEqual([]);
    });

    it("computes isDelayed the same way getTenantLedger does", async () => {
      mockedFindManyLedger.mockResolvedValueOnce([
        buildLedgerRow({ status: "PENDING", dueDate: FAR_PAST, userId: USER_1 }),
      ] as never);

      const result = await getUserLedger(TENANT_A, USER_1);

      expect(result[0].isDelayed).toBe(true);
    });
  });

  describe("recordTenantPayment", () => {
    function mockTransactionAgainst(ledgerRow: ReturnType<typeof buildLedgerRow> | null) {
      const txFindFirst = vi.fn().mockResolvedValue(ledgerRow);
      const txUpdate = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => ({
        ...(ledgerRow as Record<string, unknown>),
        ...args.data,
      }));
      const txNotificationCreate = vi.fn().mockResolvedValue({});
      mockedTransaction.mockImplementation(((callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          paymentLedger: { findFirst: txFindFirst, update: txUpdate },
          notification: { create: txNotificationCreate },
        })) as never);
      return { txFindFirst, txUpdate, txNotificationCreate };
    }

    it("looks up the ledger row scoped to both id and tenantId together", async () => {
      const { txFindFirst } = mockTransactionAgainst(buildLedgerRow({ amount: 1000, amountPaid: 0 }));

      await recordTenantPayment(TENANT_A, "ledger-1", 1000);

      expect(txFindFirst).toHaveBeenCalledWith({ where: { id: "ledger-1", tenantId: TENANT_A } });
    });

    it("drops the mutation and throws when the ledger belongs to a different tenant", async () => {
      // The combined { id, tenantId } where clause inside the transaction
      // is what makes this resolve to null instead of the real row when
      // TENANT_B is passed for a ledger that actually belongs to TENANT_A —
      // simulated here directly, since the mock's findFirst doesn't run a
      // real filter itself.
      const { txUpdate } = mockTransactionAgainst(null);

      await expect(recordTenantPayment(TENANT_B, "ledger-1", 500)).rejects.toThrow(/was not found for tenant/);
      expect(txUpdate).not.toHaveBeenCalled();
    });

    it("marks the installment PAID when the payment exactly satisfies the outstanding balance", async () => {
      mockTransactionAgainst(buildLedgerRow({ amount: 1000, amountPaid: 0, status: "PENDING" }));

      const result = await recordTenantPayment(TENANT_A, "ledger-1", 1000);

      expect(result.status).toBe("PAID");
      expect(result.amountPaid).toBe(1000);
    });

    it("creates a notification for the ledger's own user, inside the same transaction as the payment write", async () => {
      const { txNotificationCreate } = mockTransactionAgainst(
        buildLedgerRow({ amount: 1000, amountPaid: 0, status: "PENDING" }),
      );

      await recordTenantPayment(TENANT_A, "ledger-1", 400);

      expect(txNotificationCreate).toHaveBeenCalledWith({
        data: { tenantId: TENANT_A, userId: USER_1, message: expect.stringContaining("€400.00") },
      });
    });

    it("uses the fully-paid notification wording only when the payment actually settles the installment", async () => {
      const { txNotificationCreate } = mockTransactionAgainst(
        buildLedgerRow({ amount: 1000, amountPaid: 0, status: "PENDING" }),
      );

      await recordTenantPayment(TENANT_A, "ledger-1", 1000);

      expect(txNotificationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ message: expect.stringContaining("fully paid") }),
      });
    });

    it("marks the installment PAID when a partial payment completes an already-partially-paid balance", async () => {
      mockTransactionAgainst(buildLedgerRow({ amount: 1000, amountPaid: 600, status: "PENDING" }));

      const result = await recordTenantPayment(TENANT_A, "ledger-1", 400);

      expect(result.status).toBe("PAID");
      expect(result.amountPaid).toBe(1000);
    });

    it("keeps the installment in its existing status on a genuine partial payment", async () => {
      mockTransactionAgainst(buildLedgerRow({ amount: 1000, amountPaid: 0, status: "OVERDUE" }));

      const result = await recordTenantPayment(TENANT_A, "ledger-1", 300);

      expect(result.status).toBe("OVERDUE");
      expect(result.amountPaid).toBe(300);
    });

    it("rejects a payment that would exceed the outstanding balance", async () => {
      const { txUpdate } = mockTransactionAgainst(buildLedgerRow({ amount: 1000, amountPaid: 800 }));

      await expect(recordTenantPayment(TENANT_A, "ledger-1", 300)).rejects.toThrow(
        /exceeds the outstanding balance/,
      );
      expect(txUpdate).not.toHaveBeenCalled();
    });

    it("rejects any further payment against an already-fully-paid installment", async () => {
      const { txUpdate } = mockTransactionAgainst(buildLedgerRow({ amount: 1000, amountPaid: 1000, status: "PAID" }));

      await expect(recordTenantPayment(TENANT_A, "ledger-1", 1)).rejects.toThrow(/already fully paid/);
      expect(txUpdate).not.toHaveBeenCalled();
    });

    it("rejects a zero, negative, or non-finite amountPaid before ever starting a transaction", async () => {
      await expect(recordTenantPayment(TENANT_A, "ledger-1", 0)).rejects.toThrow(/positive, finite number/);
      await expect(recordTenantPayment(TENANT_A, "ledger-1", -50)).rejects.toThrow(/positive, finite number/);
      await expect(recordTenantPayment(TENANT_A, "ledger-1", Number.POSITIVE_INFINITY)).rejects.toThrow(
        /positive, finite number/,
      );
      expect(mockedTransaction).not.toHaveBeenCalled();
    });
  });
});
