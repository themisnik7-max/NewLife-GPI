import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  getClientDirectory,
  getClientProfile,
  getOwnClientProfile,
  getTenantClients,
  updateClientProfile,
} from "@/lib/data/clients";
import { prisma } from "@/lib/prisma";

const mockedFindMany = vi.mocked(prisma.user.findMany);
const mockedFindFirst = vi.mocked(prisma.user.findFirst);
const mockedUpdateMany = vi.mocked(prisma.user.updateMany);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ACTOR = { tenantId: TENANT_A, actorUserId: "user_admin" };

beforeEach(() => {
  // TX_PASSTHROUGH: audited writes run inside prisma.$transaction; handing
  // the callback the same mock object keeps the model assertions valid.
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (tx: unknown) => unknown) => cb(prisma)) as never);
  vi.mocked(prisma.auditLog.create).mockReset().mockResolvedValue({} as never);
  mockedFindMany.mockReset();
  mockedFindFirst.mockReset();
  mockedUpdateMany.mockReset();
});

describe("getTenantClients", () => {
  it("queries only TENANT-role users in the given tenant, ordered by most recently created", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    await getTenantClients(TENANT_A);

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A, role: "TENANT" },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("combines firstName/lastName into a display name and formats the join date", async () => {
    mockedFindMany.mockResolvedValueOnce([
      {
        id: "user_1",
        firstName: "Maria",
        lastName: "Papadopoulos",
        email: "maria@example.com",
        createdAt: new Date("2026-03-14T00:00:00.000Z"),
        propertyOwnerships: [],
      },
    ] as never);

    const result = await getTenantClients(TENANT_A);

    expect(result).toEqual([
      {
        id: "user_1",
        name: "Maria Papadopoulos",
        email: "maria@example.com",
        property: "No property assigned",
        status: "Active",
        joinedDate: "14 Mar 2026",
      },
    ]);
  });

  it("falls back to the email address when firstName/lastName are both null", async () => {
    mockedFindMany.mockResolvedValueOnce([
      {
        id: "user_2",
        firstName: null,
        lastName: null,
        email: "noname@example.com",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        propertyOwnerships: [],
      },
    ] as never);

    const result = await getTenantClients(TENANT_A);

    expect(result[0].name).toBe("noname@example.com");
  });

  it("derives the property label from the user's most recent ownership row", async () => {
    mockedFindMany.mockResolvedValueOnce([
      {
        id: "user_3",
        firstName: "Demo",
        lastName: "Client",
        email: "demo@example.com",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        propertyOwnerships: [{ property: { name: "Villa Elytra", area: "Chania" } }],
      },
    ] as never);

    const result = await getTenantClients(TENANT_A);

    expect(result[0].property).toBe("Villa Elytra — Chania");
  });
});

describe("getClientDirectory", () => {
  function userRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "user_1",
      firstName: "Maria",
      lastName: "Papadopoulos",
      email: "maria@example.com",
      phone: "+30 210 0000000",
      nationality: "Greek",
      createdAt: new Date("2026-03-14T00:00:00.000Z"),
      propertyOwnerships: [{ property: { name: "Villa Elytra", area: "Chania" } }],
      visaSteps: [{ status: "COMPLETED" }, { status: "PENDING" }],
      rentalStageRecords: [{ status: "DONE" }, { status: "PENDING" }],
      paymentLedgers: [{ amount: 1000, amountPaid: 400 }],
      ...overrides,
    };
  }

  it("pulls every workflow in one query rather than looping the per-client functions", async () => {
    mockedFindMany.mockResolvedValueOnce([] as never);

    await getClientDirectory(TENANT_A);

    expect(mockedFindMany).toHaveBeenCalledTimes(1);
    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_A, role: "TENANT" } }),
    );
  });

  it("summarises identity, property and cross-workflow position", async () => {
    mockedFindMany.mockResolvedValueOnce([userRow()] as never);

    const [entry] = await getClientDirectory(TENANT_A);

    expect(entry).toEqual({
      id: "user_1",
      name: "Maria Papadopoulos",
      email: "maria@example.com",
      phone: "+30 210 0000000",
      nationality: "Greek",
      property: "Villa Elytra — Chania",
      joinedDate: "14 Mar 2026",
      visa: { completed: 1, total: 2 },
      rental: { completed: 1, total: 10 },
      outstanding: 600,
    });
  });

  it("uses the canonical stage count as the rental denominator, not the stored row count", async () => {
    // Absence of a row means PENDING; counting rows would make one completed
    // stage out of ten read as "1 of 1".
    mockedFindMany.mockResolvedValueOnce([userRow({ rentalStageRecords: [{ status: "DONE" }] })] as never);

    const [entry] = await getClientDirectory(TENANT_A);

    expect(entry.rental).toEqual({ completed: 1, total: 10 });
  });

  it("uses the client's own step count as the visa denominator, since steps are created per client", async () => {
    mockedFindMany.mockResolvedValueOnce([userRow({ visaSteps: [] })] as never);

    const [entry] = await getClientDirectory(TENANT_A);

    expect(entry.visa).toEqual({ completed: 0, total: 0 });
  });

  it("returns null property rather than a sentence, so the component owns the empty state", async () => {
    mockedFindMany.mockResolvedValueOnce([userRow({ propertyOwnerships: [] })] as never);

    const [entry] = await getClientDirectory(TENANT_A);

    expect(entry.property).toBeNull();
  });

  it("never reports a negative outstanding balance from an overpaid installment", async () => {
    mockedFindMany.mockResolvedValueOnce([
      userRow({ paymentLedgers: [{ amount: 100, amountPaid: 500 }, { amount: 200, amountPaid: 0 }] }),
    ] as never);

    const [entry] = await getClientDirectory(TENANT_A);

    expect(entry.outstanding).toBe(200);
  });
});

const PROFILE_ROW = {
  id: "user_1",
  firstName: "Maria",
  lastName: "Papadopoulos",
  email: "maria@example.com",
  createdAt: new Date("2026-03-14T00:00:00.000Z"),
  phone: "+30 210 0000000",
  nationality: "Greek",
  passportNumber: "AB1234567",
  dateOfBirth: new Date("1985-06-02T00:00:00.000Z"),
  adminNotes: "Prefers email contact.",
};

describe("getClientProfile", () => {
  it("returns the full profile including internal notes", async () => {
    mockedFindFirst.mockResolvedValueOnce(PROFILE_ROW as never);

    const profile = await getClientProfile(TENANT_A, "user_1");

    expect(profile).toEqual({
      id: "user_1",
      name: "Maria Papadopoulos",
      email: "maria@example.com",
      joinedDate: "14 Mar 2026",
      phone: "+30 210 0000000",
      nationality: "Greek",
      passportNumber: "AB1234567",
      dateOfBirth: "1985-06-02",
      adminNotes: "Prefers email contact.",
    });
  });

  it("scopes by tenant, which is the only boundary on the Prisma path", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await getClientProfile(TENANT_A, "user_1");

    expect(mockedFindFirst).toHaveBeenCalledWith({ where: { id: "user_1", tenantId: TENANT_A } });
  });

  it("returns null for a user in another tenant", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);
    await expect(getClientProfile(TENANT_A, "user_other")).resolves.toBeNull();
  });

  it("returns a null date of birth rather than an invalid date string", async () => {
    mockedFindFirst.mockResolvedValueOnce({ ...PROFILE_ROW, dateOfBirth: null } as never);

    const profile = await getClientProfile(TENANT_A, "user_1");

    expect(profile?.dateOfBirth).toBeNull();
  });
});

describe("getOwnClientProfile", () => {
  it("withholds admin notes from the client they describe", async () => {
    // This is the ONLY thing keeping internal notes away from the client:
    // RLS's users_select lets a client read their own row, and the app reads
    // through Prisma, which ignores RLS entirely.
    mockedFindFirst.mockResolvedValueOnce(PROFILE_ROW as never);

    const profile = await getOwnClientProfile(TENANT_A, "user_1");

    expect(profile?.adminNotes).toBeNull();
  });

  it("still returns every other field, so the client can check their own details", async () => {
    mockedFindFirst.mockResolvedValueOnce(PROFILE_ROW as never);

    const profile = await getOwnClientProfile(TENANT_A, "user_1");

    expect(profile?.phone).toBe("+30 210 0000000");
    expect(profile?.passportNumber).toBe("AB1234567");
  });

  it("returns null for a missing user rather than an object of nulls", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);
    await expect(getOwnClientProfile(TENANT_A, "user_1")).resolves.toBeNull();
  });
});

describe("updateClientProfile", () => {
  const EXISTING = {
    id: "user_1",
    phone: "+30 210 0000000",
    nationality: "Greek",
    passportNumber: null,
    dateOfBirth: null,
    adminNotes: null,
  };

  it("writes only the fields supplied, so a partial form cannot blank the rest", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateClientProfile(ACTOR, "user_1", { phone: "+30 211 1111111" });

    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "user_1", tenantId: TENANT_A },
      data: { phone: "+30 211 1111111" },
    });
  });

  it("stores whitespace-only input as null, so unset has exactly one representation", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateClientProfile(ACTOR, "user_1", { phone: "   " });

    expect(mockedUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { phone: null } }));
  });

  it("converts an ISO date of birth to a Date for the date column", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateClientProfile(ACTOR, "user_1", { dateOfBirth: "1985-06-02" });

    expect(mockedUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dateOfBirth: new Date("1985-06-02") } }),
    );
  });

  it("honours an explicit null date of birth as clear-this", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateClientProfile(ACTOR, "user_1", { dateOfBirth: null });

    expect(mockedUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { dateOfBirth: null } }));
  });

  it("audits admin notes like any other field — who wrote them matters later", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateClientProfile(ACTOR, "user_1", { adminNotes: "Chasing passport scan." });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "User",
          entityId: "user_1",
          field: "adminNotes",
          oldValue: null,
          newValue: "Chasing passport scan.",
        }),
      }),
    );
  });

  it("records nothing when a field is re-submitted unchanged", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateClientProfile(ACTOR, "user_1", { phone: "+30 210 0000000" });

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("compares an existing date of birth as an ISO date string, not as a Date object", async () => {
    // The audit helper stringifies both sides; a Date would serialise to a
    // full timestamp and never match the "1985-06-02" the form submits,
    // logging a phantom edit on every save.
    mockedFindFirst.mockResolvedValueOnce({
      ...EXISTING,
      dateOfBirth: new Date("1985-06-02T00:00:00.000Z"),
    } as never);

    await updateClientProfile(ACTOR, "user_1", { dateOfBirth: "1985-06-02" });

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("audits a genuine change to an existing date of birth", async () => {
    mockedFindFirst.mockResolvedValueOnce({
      ...EXISTING,
      dateOfBirth: new Date("1985-06-02T00:00:00.000Z"),
    } as never);

    await updateClientProfile(ACTOR, "user_1", { dateOfBirth: "1985-06-03" });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          field: "dateOfBirth",
          oldValue: "1985-06-02",
          newValue: "1985-06-03",
        }),
      }),
    );
  });

  it("returns without touching the database when nothing was supplied", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateClientProfile(ACTOR, "user_1", {});

    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });

  it("throws for a user in another tenant rather than writing across the boundary", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await expect(updateClientProfile(ACTOR, "user_other", { phone: "x" })).rejects.toThrow(
      /was not found for tenant/,
    );
    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects an unparseable date of birth", async () => {
    await expect(updateClientProfile(ACTOR, "user_1", { dateOfBirth: "yesterday" })).rejects.toThrow(
      /is not a valid date/,
    );
  });

  it("rejects a future date of birth before any lookup happens", async () => {
    await expect(updateClientProfile(ACTOR, "user_1", { dateOfBirth: "2999-01-01" })).rejects.toThrow(
      /cannot be in the future/,
    );
    expect(mockedFindFirst).not.toHaveBeenCalled();
  });
});

