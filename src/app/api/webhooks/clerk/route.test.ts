// @vitest-environment node
//
// Route Handlers never run in a browser/jsdom context in production either
// way, and overriding to "node" here sidesteps any uncertainty about
// whether the project's default jsdom environment (vitest.config.ts)
// forwards Node's built-in fetch/Request/Headers globals — Vitest supports
// this per-file override specifically for server-only code like this.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock() factories are hoisted above regular top-level `const`s, so a
// plain `const verifyMock = vi.fn()` referenced inside the factory below
// would hit a temporal-dead-zone error at hoist time — vi.hoisted() is
// Vitest's documented escape hatch for sharing a mock reference between a
// vi.mock() factory and the test body itself.
const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }));

vi.mock("svix", () => ({
  Webhook: vi.fn().mockImplementation(() => ({ verify: verifyMock })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { POST } from "@/app/api/webhooks/clerk/route";
import { prisma } from "@/lib/prisma";

const mockedFindUnique = vi.mocked(prisma.user.findUnique);
const mockedUpdate = vi.mocked(prisma.user.update);
const mockedTenantUpsert = vi.mocked(prisma.tenant.upsert);
const mockedTransaction = vi.mocked(prisma.$transaction);

const FIXED_TENANT_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// Fixed reference point for recency comparisons — readable relative
// offsets (BASE_TIME - 1h / + 1h) make "older event" vs "newer event"
// assertions self-explanatory without doing date arithmetic in every test.
const BASE_TIME = new Date("2026-01-01T00:00:00.000Z").getTime();
const ONE_HOUR_MS = 60 * 60 * 1000;

const VALID_SVIX_HEADERS = {
  "svix-id": "msg_123",
  "svix-timestamp": "1700000000",
  "svix-signature": "v1,abc123",
};

function buildRequest(body: unknown, headers: Record<string, string> = VALID_SVIX_HEADERS): Request {
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function buildUserEvent(overrides: {
  type?: "user.created" | "user.updated";
  id?: string;
  email?: string | null;
  emailId?: string;
  primaryEmailAddressId?: string | null;
  publicMetadata?: Record<string, unknown>;
  updatedAt?: number;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const emailId = overrides.emailId ?? "email_1";
  return {
    type: overrides.type ?? "user.created",
    data: {
      id: overrides.id ?? "user_abc123",
      email_addresses:
        overrides.email === undefined ? [{ id: emailId, email_address: "person@example.com" }] : overrides.email === null ? [] : [{ id: emailId, email_address: overrides.email }],
      primary_email_address_id: overrides.primaryEmailAddressId === undefined ? emailId : overrides.primaryEmailAddressId,
      public_metadata: overrides.publicMetadata ?? {},
      updated_at: overrides.updatedAt ?? BASE_TIME,
      first_name: overrides.firstName === undefined ? null : overrides.firstName,
      last_name: overrides.lastName === undefined ? null : overrides.lastName,
    },
  };
}

function buildOrganizationCreatedEvent(overrides: { id?: string; name?: string; updatedAt?: number } = {}) {
  return {
    type: "organization.created",
    data: {
      id: overrides.id ?? "org_abc123",
      name: overrides.name ?? "Acme Org",
      updated_at: overrides.updatedAt ?? BASE_TIME,
    },
  };
}

function buildMembershipEvent(overrides: {
  type?: "organizationMembership.created" | "organizationMembership.updated" | "organizationMembership.deleted";
  orgId?: string;
  orgName?: string;
  userId?: string;
  role?: string;
  updatedAt?: number;
} = {}) {
  return {
    type: overrides.type ?? "organizationMembership.created",
    data: {
      organization: { id: overrides.orgId ?? "org_abc123", name: overrides.orgName ?? "Acme Org" },
      public_user_data: { user_id: overrides.userId ?? "user_member" },
      role: overrides.role ?? "org:member",
      updated_at: overrides.updatedAt ?? BASE_TIME,
    },
  };
}

describe("POST /api/webhooks/clerk", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let randomUUIDSpy: ReturnType<typeof vi.spyOn>;
  let txTenantCreate: ReturnType<typeof vi.fn>;
  let txUserCreate: ReturnType<typeof vi.fn>;
  let txUserUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_test_secret");
    verifyMock.mockReset();
    mockedFindUnique.mockReset();
    mockedUpdate.mockReset().mockResolvedValue({} as never);
    mockedTenantUpsert.mockReset().mockResolvedValue({ id: FIXED_TENANT_UUID } as never);

    txTenantCreate = vi.fn().mockResolvedValue({});
    txUserCreate = vi.fn().mockResolvedValue({});
    txUserUpdate = vi.fn().mockResolvedValue({});
    mockedTransaction.mockReset().mockImplementation(((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        tenant: { create: txTenantCreate },
        user: { create: txUserCreate, update: txUserUpdate },
      })) as never);

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    randomUUIDSpy = vi.spyOn(crypto, "randomUUID").mockReturnValue(FIXED_TENANT_UUID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // Deliberately NOT vi.restoreAllMocks(): that restores every vi.fn(),
    // including Webhook's own `.mockImplementation()` set up inside the
    // vi.mock("svix", ...) factory above — which only ever runs once at
    // module init, so restoring it here would permanently break `new
    // Webhook(...).verify` for every test after the first (this broke a
    // previous version of this suite; see LOGS.md). Restore only the spies
    // this block itself created.
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    randomUUIDSpy.mockRestore();
  });

  it("returns 500 and never calls verify when CLERK_WEBHOOK_SECRET is not configured", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "");

    const response = await POST(buildRequest(buildUserEvent({})));

    expect(response.status).toBe(500);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when svix headers are missing", async () => {
    const response = await POST(buildRequest({}, {}));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/svix headers/i);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when svix signature verification fails", async () => {
    verifyMock.mockImplementationOnce(() => {
      throw new Error("Invalid signature");
    });

    const response = await POST(buildRequest(buildUserEvent({})));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Invalid signature");
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });

  it("passes the exact svix headers and raw JSON body through to Webhook.verify", async () => {
    verifyMock.mockReturnValueOnce({ type: "user.deleted", data: {} });
    const payload = { type: "user.deleted", data: {} };

    await POST(buildRequest(payload));

    expect(verifyMock).toHaveBeenCalledWith(JSON.stringify(payload), VALID_SVIX_HEADERS);
  });

  it("acknowledges but does not touch the database for event types other than user.created/user.updated", async () => {
    verifyMock.mockReturnValueOnce({ type: "user.deleted", data: {} });

    const response = await POST(buildRequest({ type: "user.deleted", data: {} }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(mockedFindUnique).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 when the Clerk user has no email address at all", async () => {
    verifyMock.mockReturnValueOnce(buildUserEvent({ email: null }));

    const response = await POST(buildRequest({}));

    expect(response.status).toBe(400);
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });

  describe("brand-new user (no existing row)", () => {
    it("provisions a fresh tenant and creates the user inside a single transaction", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(
        buildUserEvent({ id: "user_new", email: "new@example.com", updatedAt: BASE_TIME }),
      );

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
      expect(randomUUIDSpy).toHaveBeenCalledTimes(1);
      expect(txTenantCreate).toHaveBeenCalledWith({
        data: { id: FIXED_TENANT_UUID, name: "User Tenant - user_new" },
      });
      expect(txUserCreate).toHaveBeenCalledWith({
        data: {
          id: "user_new",
          email: "new@example.com",
          role: "TENANT",
          firstName: null,
          lastName: null,
          tenantId: FIXED_TENANT_UUID,
          lastSyncedAt: new Date(BASE_TIME),
        },
      });
      expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it("captures firstName/lastName from the webhook payload on creation", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(
        buildUserEvent({ id: "user_named", firstName: "Maria", lastName: "Papadopoulos" }),
      );

      await POST(buildRequest({}));

      expect(txUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ firstName: "Maria", lastName: "Papadopoulos" }) }),
      );
    });

    it("falls back to the first email address when primary_email_address_id matches nothing", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(
        buildUserEvent({ id: "user_x", email: "fallback@example.com", primaryEmailAddressId: "does-not-exist" }),
      );

      await POST(buildRequest({}));

      expect(txUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: "fallback@example.com" }) }),
      );
    });

    it("still succeeds when the payload has no updated_at at all", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce({
        type: "user.created",
        data: {
          id: "user_no_ts",
          email_addresses: [{ id: "email_1", email_address: "no-ts@example.com" }],
          primary_email_address_id: "email_1",
          public_metadata: {},
          first_name: null,
          last_name: null,
        },
      });

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
    });

    it("rolls back cleanly (via the outer error boundary) if a concurrent delivery already created the user", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(buildUserEvent({ id: "user_race" }));
      mockedTransaction.mockReset().mockImplementation((async () => {
        throw new Error("Unique constraint failed on the fields: (`clerk_user_id`)");
      }) as never);

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("existing user (recency-gated update)", () => {
    it("updates mutable fields when the incoming event is newer than the stored lastSyncedAt", async () => {
      mockedFindUnique.mockResolvedValueOnce({
        lastSyncedAt: new Date(BASE_TIME - ONE_HOUR_MS),
        tenant: { clerkOrgId: null },
      } as never);
      verifyMock.mockReturnValueOnce(
        buildUserEvent({ type: "user.updated", id: "user_existing", email: "updated@example.com", updatedAt: BASE_TIME }),
      );

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
      expect(mockedUpdate).toHaveBeenCalledWith({
        where: { id: "user_existing" },
        data: {
          email: "updated@example.com",
          role: "TENANT",
          firstName: null,
          lastName: null,
          lastSyncedAt: new Date(BASE_TIME),
        },
      });
      expect(mockedTransaction).not.toHaveBeenCalled();
    });

    it("captures firstName/lastName from the webhook payload on update", async () => {
      mockedFindUnique.mockResolvedValueOnce({
        lastSyncedAt: new Date(BASE_TIME - ONE_HOUR_MS),
        tenant: { clerkOrgId: null },
      } as never);
      verifyMock.mockReturnValueOnce(
        buildUserEvent({ type: "user.updated", id: "user_existing", firstName: "Dimitris", lastName: "Anagnostou" }),
      );

      await POST(buildRequest({}));

      expect(mockedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ firstName: "Dimitris", lastName: "Anagnostou" }) }),
      );
    });

    it("processes the update when lastSyncedAt was never recorded (pre-migration row)", async () => {
      mockedFindUnique.mockResolvedValueOnce({ lastSyncedAt: null, tenant: { clerkOrgId: null } } as never);
      verifyMock.mockReturnValueOnce(buildUserEvent({ type: "user.updated", id: "user_legacy" }));

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
      expect(mockedUpdate).toHaveBeenCalled();
    });

    it("skips a stale event when lastSyncedAt is strictly newer than the incoming event", async () => {
      mockedFindUnique.mockResolvedValueOnce({ lastSyncedAt: new Date(BASE_TIME + ONE_HOUR_MS) } as never);
      verifyMock.mockReturnValueOnce(
        buildUserEvent({ type: "user.created", id: "user_existing", updatedAt: BASE_TIME }),
      );

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true, skipped: "stale event" });
      expect(mockedUpdate).not.toHaveBeenCalled();
      expect(mockedTransaction).not.toHaveBeenCalled();
    });

    it("skips a stale event when lastSyncedAt exactly equals the incoming event time (duplicate redelivery)", async () => {
      // This is the "same event delivered twice" case: the first delivery
      // already set lastSyncedAt to exactly this event's own timestamp, so
      // a redelivery must be a no-op rather than re-running the update.
      mockedFindUnique.mockResolvedValueOnce({ lastSyncedAt: new Date(BASE_TIME) } as never);
      verifyMock.mockReturnValueOnce(buildUserEvent({ type: "user.created", id: "user_dup", updatedAt: BASE_TIME }));

      const response = await POST(buildRequest({}));

      await expect(response.json()).resolves.toEqual({ received: true, skipped: "stale event" });
      expect(mockedUpdate).not.toHaveBeenCalled();
    });
  });

  describe("case-insensitive role resolution", () => {
    it.each(["admin", "ADMIN", "Admin", "aDmIn"])("resolves %s to Role.ADMIN", async (roleValue) => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(buildUserEvent({ id: "user_admin", publicMetadata: { role: roleValue } }));

      await POST(buildRequest({}));

      expect(txUserCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "ADMIN" }) }));
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("resolves 'tenant' (any casing) to Role.TENANT without warning", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(buildUserEvent({ id: "user_tenant", publicMetadata: { role: "TENANT" } }));

      await POST(buildRequest({}));

      expect(txUserCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "TENANT" }) }));
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("warns and defaults to TENANT for an unrecognized role string", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(buildUserEvent({ id: "user_typo", publicMetadata: { role: "admni" } }));

      await POST(buildRequest({}));

      expect(txUserCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "TENANT" }) }));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("admni"));
    });

    it("does not warn when publicMetadata.role is simply absent", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(buildUserEvent({ id: "user_norole", publicMetadata: {} }));

      await POST(buildRequest({}));

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("warns and defaults to TENANT when role is present but not a string at all", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(buildUserEvent({ id: "user_badtype", publicMetadata: { role: 12345 } }));

      await POST(buildRequest({}));

      expect(txUserCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "TENANT" }) }));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("12345"));
    });
  });

  describe("existing user whose tenant is org-backed", () => {
    it("does not let a plain profile update overwrite an org-derived role", async () => {
      // publicMetadata deliberately conflicts with the user's real,
      // org-derived ADMIN role — proving the update genuinely ignores it
      // rather than happening to agree with it by coincidence.
      mockedFindUnique.mockResolvedValueOnce({
        lastSyncedAt: new Date(BASE_TIME - ONE_HOUR_MS),
        tenant: { clerkOrgId: "org_abc123" },
      } as never);
      verifyMock.mockReturnValueOnce(
        buildUserEvent({
          type: "user.updated",
          id: "user_orgadmin",
          email: "admin@example.com",
          publicMetadata: { role: "tenant" },
        }),
      );

      await POST(buildRequest({}));

      expect(mockedUpdate).toHaveBeenCalledWith({
        where: { id: "user_orgadmin" },
        data: {
          email: "admin@example.com",
          firstName: null,
          lastName: null,
          lastSyncedAt: new Date(BASE_TIME),
        },
      });
    });
  });

  describe("organization.created", () => {
    it("upserts a tenant keyed on the Clerk organization id, not a bare create", async () => {
      verifyMock.mockReturnValueOnce(buildOrganizationCreatedEvent({ id: "org_new", name: "Papadopoulos Villas" }));

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
      expect(mockedTenantUpsert).toHaveBeenCalledWith({
        where: { clerkOrgId: "org_new" },
        create: { id: FIXED_TENANT_UUID, name: "Papadopoulos Villas", clerkOrgId: "org_new" },
        update: {},
      });
    });

    it("still succeeds when the payload has no updated_at at all", async () => {
      verifyMock.mockReturnValueOnce({ type: "organization.created", data: { id: "org_no_ts", name: "No Timestamp Org" } });

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
    });
  });

  describe("organizationMembership.created / organizationMembership.updated", () => {
    it.each(["organizationMembership.created", "organizationMembership.updated"] as const)(
      "assigns the org's tenant and maps org:admin to Role.ADMIN for a %s event",
      async (eventType) => {
        mockedFindUnique.mockResolvedValueOnce({ orgMembershipSyncedAt: null } as never);
        verifyMock.mockReturnValueOnce(
          buildMembershipEvent({ type: eventType, userId: "user_admin", role: "org:admin" }),
        );

        const response = await POST(buildRequest({}));

        expect(response.status).toBe(200);
        expect(mockedTenantUpsert).toHaveBeenCalledWith({
          where: { clerkOrgId: "org_abc123" },
          create: { id: FIXED_TENANT_UUID, name: "Acme Org", clerkOrgId: "org_abc123" },
          update: {},
        });
        expect(mockedUpdate).toHaveBeenCalledWith({
          where: { id: "user_admin" },
          data: {
            tenantId: FIXED_TENANT_UUID,
            role: "ADMIN",
            orgMembershipSyncedAt: new Date(BASE_TIME),
          },
        });
      },
    );

    it("maps org:member to Role.TENANT", async () => {
      mockedFindUnique.mockResolvedValueOnce({ orgMembershipSyncedAt: null } as never);
      verifyMock.mockReturnValueOnce(buildMembershipEvent({ userId: "user_client", role: "org:member" }));

      await POST(buildRequest({}));

      expect(mockedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: "TENANT" }) }),
      );
    });

    it("warns and defaults to TENANT for an unrecognized organization role", async () => {
      mockedFindUnique.mockResolvedValueOnce({ orgMembershipSyncedAt: null } as never);
      verifyMock.mockReturnValueOnce(buildMembershipEvent({ userId: "user_custom", role: "org:billing_manager" }));

      await POST(buildRequest({}));

      expect(mockedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: "TENANT" }) }),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("org:billing_manager"));
    });

    it("skips a stale event when orgMembershipSyncedAt is already newer than the incoming event", async () => {
      mockedFindUnique.mockResolvedValueOnce({
        orgMembershipSyncedAt: new Date(BASE_TIME + ONE_HOUR_MS),
      } as never);
      verifyMock.mockReturnValueOnce(buildMembershipEvent({ updatedAt: BASE_TIME }));

      const response = await POST(buildRequest({}));

      await expect(response.json()).resolves.toEqual({ received: true, skipped: "stale event" });
      expect(mockedTenantUpsert).not.toHaveBeenCalled();
      expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it("returns 500 (so Clerk retries) when the target user hasn't synced via user.created yet", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(buildMembershipEvent({ userId: "user_not_synced_yet" }));

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("still succeeds when the payload has no updated_at at all", async () => {
      mockedFindUnique.mockResolvedValueOnce({ orgMembershipSyncedAt: null } as never);
      verifyMock.mockReturnValueOnce({
        type: "organizationMembership.created",
        data: {
          organization: { id: "org_abc123", name: "Acme Org" },
          public_user_data: { user_id: "user_no_ts" },
          role: "org:member",
        },
      });

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
    });
  });

  describe("organizationMembership.deleted", () => {
    it("gives the removed member a fresh personal tenant and resets their role to TENANT", async () => {
      mockedFindUnique.mockResolvedValueOnce({ orgMembershipSyncedAt: new Date(BASE_TIME - ONE_HOUR_MS) } as never);
      verifyMock.mockReturnValueOnce(
        buildMembershipEvent({ type: "organizationMembership.deleted", userId: "user_removed" }),
      );

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
      expect(txTenantCreate).toHaveBeenCalledWith({
        data: { id: FIXED_TENANT_UUID, name: "User Tenant - user_removed" },
      });
      expect(txUserUpdate).toHaveBeenCalledWith({
        where: { id: "user_removed" },
        data: {
          tenantId: FIXED_TENANT_UUID,
          role: "TENANT",
          orgMembershipSyncedAt: new Date(BASE_TIME),
        },
      });
    });

    it("skips a stale removal event when orgMembershipSyncedAt is already newer", async () => {
      mockedFindUnique.mockResolvedValueOnce({
        orgMembershipSyncedAt: new Date(BASE_TIME + ONE_HOUR_MS),
      } as never);
      verifyMock.mockReturnValueOnce(
        buildMembershipEvent({ type: "organizationMembership.deleted", updatedAt: BASE_TIME }),
      );

      const response = await POST(buildRequest({}));

      await expect(response.json()).resolves.toEqual({ received: true, skipped: "stale event" });
      expect(mockedTransaction).not.toHaveBeenCalled();
    });

    it("still succeeds when the payload has no updated_at at all", async () => {
      mockedFindUnique.mockResolvedValueOnce({ orgMembershipSyncedAt: null } as never);
      verifyMock.mockReturnValueOnce({
        type: "organizationMembership.deleted",
        data: {
          organization: { id: "org_abc123", name: "Acme Org" },
          public_user_data: { user_id: "user_no_ts" },
          role: "org:member",
        },
      });

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
    });

    it("acknowledges without erroring when the removed user is unknown", async () => {
      mockedFindUnique.mockResolvedValueOnce(null);
      verifyMock.mockReturnValueOnce(
        buildMembershipEvent({ type: "organizationMembership.deleted", userId: "user_unknown" }),
      );

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true, skipped: "unknown user" });
      expect(mockedTransaction).not.toHaveBeenCalled();
    });
  });

  describe("comprehensive error boundary", () => {
    it("returns 500 and logs when the database lookup itself throws", async () => {
      mockedFindUnique.mockRejectedValueOnce(new Error("connection terminated unexpectedly"));
      verifyMock.mockReturnValueOnce(buildUserEvent({}));

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBeTruthy();
      expect(consoleErrorSpy).toHaveBeenCalledWith("Clerk webhook processing failed:", expect.any(Error));
    });

    it("returns 500 when the update path throws", async () => {
      mockedFindUnique.mockResolvedValueOnce({
        lastSyncedAt: new Date(BASE_TIME - ONE_HOUR_MS),
        tenant: { clerkOrgId: null },
      } as never);
      mockedUpdate.mockRejectedValueOnce(new Error("deadlock detected"));
      verifyMock.mockReturnValueOnce(buildUserEvent({ type: "user.updated" }));

      const response = await POST(buildRequest({}));

      expect(response.status).toBe(500);
    });
  });
});
