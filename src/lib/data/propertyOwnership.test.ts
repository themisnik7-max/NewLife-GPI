import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  assignPropertyToClient,
  getClientPropertySnapshot,
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
      create: vi.fn(),
      update: vi.fn(),
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
    expect(mockedOwnershipCreate).toHaveBeenCalledWith({
      data: { tenantId: TENANT_A, userId: "user_1", propertyId: PROPERTY_1 },
    });
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
