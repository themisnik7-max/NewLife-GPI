import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  assignPropertyToClient,
  getClientPropertySnapshot,
  updateRentalStage,
} from "@/lib/data/propertyOwnership";
import { prisma } from "@/lib/prisma";

vi.mock("server-only", () => ({}));

// No @supabase/supabase-js mock any more: this module is Prisma-only as of
// 2026-07-27 (the PostgREST read path was removed — see the header comment
// in propertyOwnership.ts). The getOwnedProperty/getCurrentRentalStage
// suites that lived here went with it.
vi.mock("@/lib/prisma", () => ({
  prisma: {
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
  },
}));

const mockedFindFirst = vi.mocked(prisma.propertyOwnership.findFirst);
const mockedOwnershipCreate = vi.mocked(prisma.propertyOwnership.create);
const mockedOwnershipUpdate = vi.mocked(prisma.propertyOwnership.update);
const mockedPropertyFindFirst = vi.mocked(prisma.property.findFirst);
const mockedUserFindFirst = vi.mocked(prisma.user.findFirst);

beforeEach(() => {
  mockedFindFirst.mockReset();
  mockedOwnershipCreate.mockReset();
  mockedOwnershipUpdate.mockReset();
  mockedPropertyFindFirst.mockReset();
  mockedUserFindFirst.mockReset();
});

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

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

    expect(result).toEqual({ property: null, rentalStage: null });
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

  it("maps the joined property through the real Prisma-shaped mapper and validates rentalStage through toRentalStage()", async () => {
    mockedFindFirst.mockResolvedValueOnce({
      id: "ownership-1",
      tenantId: TENANT_A,
      userId: "user_1",
      propertyId: "property-1",
      rentalStage: "VENDORS_ENGAGED",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      property: PROPERTY_ROW,
    } as never);

    const result = await getClientPropertySnapshot(TENANT_A, "user_1");

    expect(result.rentalStage).toBe("VENDORS_ENGAGED");
    expect(result.property).toEqual(
      expect.objectContaining({ id: "property-1", name: "Villa Elytra", address: "Chania, Crete, Greece" }),
    );
  });

  it("throws on an unrecognized rentalStage value from the database, rather than mistyping the row", async () => {
    // PropertyOwnership.rentalStage is a Prisma String column, not a
    // narrowed enum (see the comment on it in prisma/schema.prisma) — this
    // Prisma-path return used to pass the raw value straight through with
    // no validation at all, unlike the Supabase-path getCurrentRentalStage
    // above, which already used toRentalStage().
    mockedFindFirst.mockResolvedValueOnce({
      id: "ownership-2",
      tenantId: TENANT_A,
      userId: "user_1",
      propertyId: "property-1",
      rentalStage: "MOVED_IN",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      property: PROPERTY_ROW,
    } as never);

    await expect(getClientPropertySnapshot(TENANT_A, "user_1")).rejects.toThrow(/Unrecognized rental_stage/);
  });
});

const PROPERTY_1 = "33333333-3333-3333-3333-333333333333";

describe("assignPropertyToClient", () => {
  it("creates an ownership row once both the property and the user are confirmed to belong to the tenant", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce({ id: PROPERTY_1 } as never);
    mockedUserFindFirst.mockResolvedValueOnce({ id: "user_1" } as never);
    mockedFindFirst.mockResolvedValueOnce(null);

    await assignPropertyToClient(TENANT_A, "user_1", PROPERTY_1);

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

    await expect(assignPropertyToClient(TENANT_B, "user_1", PROPERTY_1)).rejects.toThrow(
      /Property .* was not found for tenant/,
    );
    expect(mockedOwnershipCreate).not.toHaveBeenCalled();
  });

  it("throws without creating anything when the user belongs to a different tenant", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce({ id: PROPERTY_1 } as never);
    mockedUserFindFirst.mockResolvedValueOnce(null);

    await expect(assignPropertyToClient(TENANT_A, "user_other", PROPERTY_1)).rejects.toThrow(
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

    await assignPropertyToClient(TENANT_A, "user_1", PROPERTY_1);

    expect(mockedOwnershipCreate).not.toHaveBeenCalled();
  });
});

describe("updateRentalStage", () => {
  it("updates the client's most recent ownership row, matching the read path's own ordering", async () => {
    mockedFindFirst.mockResolvedValueOnce({ id: "ownership-newest" } as never);

    await updateRentalStage(TENANT_A, "user_1", "HANDOVER");

    expect(mockedFindFirst).toHaveBeenCalledWith({
      where: { userId: "user_1", tenantId: TENANT_A },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    expect(mockedOwnershipUpdate).toHaveBeenCalledWith({
      where: { id: "ownership-newest" },
      data: { rentalStage: "HANDOVER" },
    });
  });

  it("throws when the client has no ownership row to advance", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await expect(updateRentalStage(TENANT_A, "user_1", "HANDOVER")).rejects.toThrow(
      /No property ownership was found/,
    );
    expect(mockedOwnershipUpdate).not.toHaveBeenCalled();
  });

  it("rejects an invalid stage before touching the database at all", async () => {
    await expect(updateRentalStage(TENANT_A, "user_1", "MOVED_IN" as never)).rejects.toThrow(
      /Unrecognized rental_stage/,
    );
    expect(mockedFindFirst).not.toHaveBeenCalled();
    expect(mockedOwnershipUpdate).not.toHaveBeenCalled();
  });
});

