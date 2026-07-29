import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  assignPropertyToClient,
  recordSale,
  getClientPropertySnapshot,
  getOwnershipsForProperty,
  updateSaleDetails,
} from "@/lib/data/propertyOwnership";
import { prisma } from "@/lib/prisma";

vi.mock("server-only", () => ({}));

// No @supabase/supabase-js mock any more: this module is Prisma-only as of
// 2026-07-27 (the PostgREST read path was removed — see the header comment
// in propertyOwnership.ts). The getOwnedProperty/getCurrentRentalStage
// suites that lived here went with it.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
    propertyOwnership: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    property: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const mockedFindFirst = vi.mocked(prisma.propertyOwnership.findFirst);
const mockedOwnershipCreate = vi.mocked(prisma.propertyOwnership.create);
const mockedOwnershipUpdate = vi.mocked(prisma.propertyOwnership.update);
const mockedPropertyFindFirst = vi.mocked(prisma.property.findFirst);
const mockedUserFindFirst = vi.mocked(prisma.user.findFirst);
const mockedOwnershipFindMany = vi.mocked(prisma.propertyOwnership.findMany);
const mockedOwnershipUpdateMany = vi.mocked(prisma.propertyOwnership.updateMany);

beforeEach(() => {
  // TX_PASSTHROUGH: every audited mutation now runs inside
  // prisma.$transaction; handing the callback the same mock object keeps
  // each model assertion below valid without rewriting them.
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (tx: unknown) => unknown) => cb(prisma)) as never);
  vi.mocked(prisma.auditLog.create).mockReset().mockResolvedValue({} as never);
  mockedFindFirst.mockReset();
  mockedOwnershipCreate.mockReset();
  mockedOwnershipUpdate.mockReset();
  mockedPropertyFindFirst.mockReset();
  mockedUserFindFirst.mockReset();
  mockedOwnershipFindMany.mockReset();
  mockedOwnershipUpdateMany.mockReset();
});

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const ACTOR_A = { tenantId: TENANT_A, actorUserId: "user_admin" };
const ACTOR_B = { tenantId: TENANT_B, actorUserId: "user_admin" };

describe("getClientPropertySnapshot", () => {
  const PROPERTY_ROW = {
    id: "property-1",
    tenantId: TENANT_A,
    name: "Villa Elytra",
    address: "Chania, Crete, Greece",
    area: "Chania",
    totalUnits: 8,
    availableUnits: 2,
    deliveryDate: new Date("2027-06-01"),
    contractDate: new Date("2026-02-10"),
    floor: 1,
    sqm: 118,
    energyClass: "A",
    imageUrl: "https://placehold.co/800x450?text=Villa+Elytra",
    status: "UNDER_CONSTRUCTION",
    listedForRental: false,
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Chania",
    pptUrl: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };

  it("returns null property and null rentalStage when the user has no ownership row", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    const result = await getClientPropertySnapshot(TENANT_A, "user_1");

    expect(result).toEqual({ property: null });
  });

  it("queries scoped to both userId and tenantId, most recent ownership first", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await getClientPropertySnapshot(TENANT_A, "user_1");

    expect(mockedFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", tenantId: TENANT_A },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("maps the joined property through the real Prisma-shaped mapper", async () => {
    // rentalStage no longer travels with this snapshot — rental progress is
    // a set of per-stage records now (src/lib/data/rentalStages.ts), which
    // has its own suite.
    mockedFindFirst.mockResolvedValueOnce({
      id: "ownership-1",
      tenantId: TENANT_A,
      userId: "user_1",
      propertyId: "property-1",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      property: PROPERTY_ROW,
    } as never);

    const result = await getClientPropertySnapshot(TENANT_A, "user_1");

    expect(result.property).toEqual(
      expect.objectContaining({ id: "property-1", name: "Villa Elytra", address: "Chania, Crete, Greece" }),
    );
  });
});

const PROPERTY_1 = "33333333-3333-3333-3333-333333333333";

describe("assignPropertyToClient", () => {
  it("creates an ownership row once both the property and the user are confirmed to belong to the tenant", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce({ id: PROPERTY_1 } as never);
    mockedUserFindFirst.mockResolvedValueOnce({ id: "user_1" } as never);
    mockedFindFirst.mockResolvedValueOnce(null);
    mockedOwnershipCreate.mockResolvedValueOnce({ id: "ownership-new" } as never);

    await assignPropertyToClient(ACTOR_A, "user_1", PROPERTY_1);

    expect(mockedPropertyFindFirst).toHaveBeenCalledWith({
      where: { id: PROPERTY_1, tenantId: TENANT_A },
      select: { id: true },
    });
    expect(mockedUserFindFirst).toHaveBeenCalledWith({
      where: { id: "user_1", tenantId: TENANT_A },
      select: { id: true },
    });
    // Sale date and price are written as explicit nulls when not supplied.
    // Asserted rather than loosened to `objectContaining`: an assignment
    // that silently carried over a previous caller's sale figures would be a
    // real bug, and only an exact payload check catches it.
    expect(mockedOwnershipCreate).toHaveBeenCalledWith({
      data: { tenantId: TENANT_A, userId: "user_1", propertyId: PROPERTY_1, saleDate: null, salePrice: null },
    });
  });

  it("stores the sale date and price when the assignment supplies them", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce({ id: PROPERTY_1 } as never);
    mockedUserFindFirst.mockResolvedValueOnce({ id: "user_1" } as never);
    mockedFindFirst.mockResolvedValueOnce(null);
    mockedOwnershipCreate.mockResolvedValueOnce({ id: "ownership-new" } as never);

    await assignPropertyToClient(ACTOR_A, "user_1", PROPERTY_1, {
      saleDate: "2026-03-14",
      salePrice: 425000,
    });

    expect(mockedOwnershipCreate).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_A,
        userId: "user_1",
        propertyId: PROPERTY_1,
        saleDate: new Date("2026-03-14"),
        salePrice: 425000,
      },
    });
  });

  it("rejects a sale dated in the future before writing anything", async () => {
    // A future sale date is always a typo — this records a sale that
    // happened. Rejected before the tenant lookups so nothing is written.
    await expect(
      assignPropertyToClient(ACTOR_A, "user_1", PROPERTY_1, { saleDate: "2999-01-01" }),
    ).rejects.toThrow(/cannot be in the future/);
    expect(mockedOwnershipCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-positive sale price", async () => {
    await expect(
      assignPropertyToClient(ACTOR_A, "user_1", PROPERTY_1, { salePrice: 0 }),
    ).rejects.toThrow(/positive, finite number/);
    expect(mockedOwnershipCreate).not.toHaveBeenCalled();
  });

  it("throws without creating anything when the property belongs to a different tenant", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce(null);
    mockedUserFindFirst.mockResolvedValueOnce({ id: "user_1" } as never);

    await expect(assignPropertyToClient(ACTOR_B, "user_1", PROPERTY_1)).rejects.toThrow(
      /Property .* was not found for tenant/,
    );
    expect(mockedOwnershipCreate).not.toHaveBeenCalled();
  });

  it("throws without creating anything when the user belongs to a different tenant", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce({ id: PROPERTY_1 } as never);
    mockedUserFindFirst.mockResolvedValueOnce(null);

    await expect(assignPropertyToClient(ACTOR_A, "user_other", PROPERTY_1)).rejects.toThrow(
      /User .* was not found for tenant/,
    );
    expect(mockedOwnershipCreate).not.toHaveBeenCalled();
  });

  it("is idempotent: re-assigning a property the client already owns does not create a duplicate", async () => {
    // PropertyOwnership has @@unique([userId, propertyId]); without this
    // early return the admin would see a raw Prisma constraint error.
    mockedPropertyFindFirst.mockResolvedValueOnce({ id: PROPERTY_1 } as never);
    mockedUserFindFirst.mockResolvedValueOnce({ id: "user_1" } as never);
    mockedFindFirst.mockResolvedValueOnce({ id: "ownership-1" } as never);

    await assignPropertyToClient(ACTOR_A, "user_1", PROPERTY_1);

    expect(mockedOwnershipCreate).not.toHaveBeenCalled();
  });
});

describe("getOwnershipsForProperty", () => {
  it("returns the ownership id, which the read-only portfolio view deliberately omits", async () => {
    // updateSaleDetails needs a row id: one client can own several
    // properties, so userId alone does not identify the row to edit.
    mockedOwnershipFindMany.mockResolvedValueOnce([
      {
        id: "ownership-1",
        userId: "user_1",
        saleDate: new Date("2026-03-14"),
        salePrice: "425000.00",
        user: { email: "maria@example.com", firstName: "Maria", lastName: "Papadopoulos" },
      },
    ] as never);

    const rows = await getOwnershipsForProperty(TENANT_A, PROPERTY_1);

    expect(rows).toEqual([
      {
        id: "ownership-1",
        userId: "user_1",
        clientName: "Maria Papadopoulos",
        saleDate: "2026-03-14",
        salePrice: 425000,
      },
    ]);
  });

  it("scopes the query by tenant, which is the only access boundary on the Prisma path", async () => {
    mockedOwnershipFindMany.mockResolvedValueOnce([] as never);

    await getOwnershipsForProperty(TENANT_A, PROPERTY_1);

    expect(mockedOwnershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_A, propertyId: PROPERTY_1 } }),
    );
  });

  it("falls back to the email when the client has no name synced from Clerk", async () => {
    mockedOwnershipFindMany.mockResolvedValueOnce([
      {
        id: "ownership-2",
        userId: "user_2",
        saleDate: null,
        salePrice: null,
        user: { email: "nameless@example.com", firstName: null, lastName: null },
      },
    ] as never);

    const [row] = await getOwnershipsForProperty(TENANT_A, PROPERTY_1);

    expect(row.clientName).toBe("nameless@example.com");
    expect(row.saleDate).toBeNull();
    expect(row.salePrice).toBeNull();
  });
});

describe("updateSaleDetails", () => {
  const EXISTING = {
    id: "ownership-1",
    userId: "user_1",
    propertyId: PROPERTY_1,
    saleDate: new Date("2026-03-14"),
    salePrice: "425000.00",
  };

  it("writes only the fields supplied, so editing the price cannot blank the date", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateSaleDetails(ACTOR_A, "ownership-1", { salePrice: 450000 });

    expect(mockedOwnershipUpdateMany).toHaveBeenCalledWith({
      where: { id: "ownership-1", tenantId: TENANT_A },
      data: { salePrice: 450000 },
    });
  });

  it("honours an explicit null as 'clear this', which is what makes a typo correctable", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateSaleDetails(ACTOR_A, "ownership-1", { saleDate: null, salePrice: null });

    expect(mockedOwnershipUpdateMany).toHaveBeenCalledWith({
      where: { id: "ownership-1", tenantId: TENANT_A },
      data: { saleDate: null, salePrice: null },
    });
  });

  it("combines the id and tenantId in one atomic where clause, never a bare update()", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateSaleDetails(ACTOR_B, "ownership-1", { salePrice: 1 });

    // ACTOR_B's tenant is carried into the write itself, not merely checked
    // beforehand — update()'s where accepts only a unique field and would
    // drop the tenant filter entirely.
    expect(mockedOwnershipUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ownership-1", tenantId: TENANT_B } }),
    );
  });

  it("audits a real change, comparing the Decimal price as a number", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateSaleDetails(ACTOR_A, "ownership-1", { salePrice: 450000 });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "PropertyOwnership",
          entityId: "ownership-1",
          field: "salePrice",
          oldValue: "425000",
          newValue: "450000",
        }),
      }),
    );
  });

  it("records nothing when the price is re-submitted unchanged", async () => {
    // Decimal("425000.00") and the number 425000 stringify differently; if
    // the comparison were done on the raw Decimal this would log a phantom
    // edit on every save, distorting any later timing analysis.
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateSaleDetails(ACTOR_A, "ownership-1", { salePrice: 425000 });

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns without touching the database when nothing was supplied", async () => {
    mockedFindFirst.mockResolvedValueOnce(EXISTING as never);

    await updateSaleDetails(ACTOR_A, "ownership-1", {});

    expect(mockedOwnershipUpdateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("throws for an ownership in another tenant rather than writing across the boundary", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await expect(updateSaleDetails(ACTOR_B, "ownership-1", { salePrice: 1 })).rejects.toThrow(
      /was not found for tenant/,
    );
    expect(mockedOwnershipUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects an unparseable sale date", async () => {
    await expect(updateSaleDetails(ACTOR_A, "ownership-1", { saleDate: "not-a-date" })).rejects.toThrow(
      /is not a valid date/,
    );
  });

  it("rejects a future sale date before any lookup happens", async () => {
    await expect(updateSaleDetails(ACTOR_A, "ownership-1", { saleDate: "2999-01-01" })).rejects.toThrow(
      /cannot be in the future/,
    );
    expect(mockedFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a negative sale price, mirroring the database check constraint", async () => {
    await expect(updateSaleDetails(ACTOR_A, "ownership-1", { salePrice: -5 })).rejects.toThrow(
      /positive, finite number/,
    );
  });
});

describe("recordSale (the one-step flow)", () => {
  const USER_1 = "user_maria";

  beforeEach(() => {
    mockedPropertyFindFirst.mockResolvedValue({ id: PROPERTY_1 } as never);
    mockedUserFindFirst.mockResolvedValue({ id: USER_1 } as never);
    mockedOwnershipCreate.mockResolvedValue({ id: "own-1" } as never);
    mockedOwnershipUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("creates the ownership WITH its sale details in one write", async () => {
    // The whole point: this replaced create-property -> assign -> price,
    // which was three pages for one business event.
    mockedFindFirst.mockResolvedValueOnce(null as never);

    await recordSale(ACTOR_A, USER_1, PROPERTY_1, { saleDate: "2026-06-01", salePrice: 250000 });

    const { data } = mockedOwnershipCreate.mock.calls[0][0] as {
      data: { tenantId: string; userId: string; propertyId: string; salePrice: number; saleDate: Date };
    };
    expect(data.tenantId).toBe(TENANT_A);
    expect(data.userId).toBe(USER_1);
    expect(data.propertyId).toBe(PROPERTY_1);
    expect(data.salePrice).toBe(250000);
    expect(data.saleDate).toEqual(new Date("2026-06-01"));
  });

  it("verifies BOTH the property and the buyer belong to the tenant first", async () => {
    // Prisma bypasses RLS, so a crafted request naming another tenant's
    // property would otherwise succeed.
    mockedPropertyFindFirst.mockResolvedValueOnce(null as never);
    await expect(recordSale(ACTOR_A, USER_1, PROPERTY_1, {})).rejects.toThrow(
      /Property .* was not found for tenant/,
    );

    mockedPropertyFindFirst.mockResolvedValue({ id: PROPERTY_1 } as never);
    mockedUserFindFirst.mockResolvedValueOnce(null as never);
    await expect(recordSale(ACTOR_A, USER_1, PROPERTY_1, {})).rejects.toThrow(
      /User .* was not found for tenant/,
    );

    expect(mockedOwnershipCreate).not.toHaveBeenCalled();
  });

  it("updates the sale details instead of dropping them when the buyer already owns the unit", async () => {
    // assignPropertyToClient returns early and silently on an existing
    // ownership, which would send the price and date to the floor. That
    // early return is right for its own purpose and wrong for this one.
    mockedFindFirst.mockResolvedValueOnce({ id: "own-1" } as never);
    mockedFindFirst.mockResolvedValueOnce({
      id: "own-1",
      saleDate: null,
      salePrice: null,
    } as never);

    await recordSale(ACTOR_A, USER_1, PROPERTY_1, { salePrice: 300000 });

    expect(mockedOwnershipCreate).not.toHaveBeenCalled();
    expect(mockedOwnershipUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { salePrice: 300000 } }),
    );
  });

  it("rejects a future sale date — this records what happened, not what is planned", async () => {
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await expect(
      recordSale(ACTOR_A, USER_1, PROPERTY_1, { saleDate: nextYear }),
    ).rejects.toThrow(/cannot be in the future/);
    expect(mockedOwnershipCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-positive price", async () => {
    await expect(
      recordSale(ACTOR_A, USER_1, PROPERTY_1, { salePrice: 0 }),
    ).rejects.toThrow(/positive/);
  });

  it("accepts a sale with neither price nor date — both are real gaps", async () => {
    mockedFindFirst.mockResolvedValueOnce(null as never);

    await recordSale(ACTOR_A, USER_1, PROPERTY_1, { saleDate: null, salePrice: null });

    const { data } = mockedOwnershipCreate.mock.calls[0][0] as {
      data: { salePrice: number | null; saleDate: Date | null };
    };
    expect(data.salePrice).toBeNull();
    expect(data.saleDate).toBeNull();
  });

  it("audits a new sale as a CREATE, tagged so it is distinguishable later", async () => {
    mockedFindFirst.mockResolvedValueOnce(null as never);

    await recordSale(ACTOR_A, USER_1, PROPERTY_1, { salePrice: 250000 });

    const { data } = vi.mocked(prisma.auditLog.create).mock.calls[0][0] as {
      data: { action: string; entityType: string; metadata: Record<string, unknown> };
    };
    expect(data.action).toBe("CREATE");
    expect(data.entityType).toBe("PropertyOwnership");
    // A sale recorded in one action and an assignment later priced look
    // identical in the row otherwise.
    expect(data.metadata.via).toBe("record_sale");
  });
});
