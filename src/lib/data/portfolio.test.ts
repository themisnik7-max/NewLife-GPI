import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRentalInventory, getSoldProperties, getSoldPropertyDetail } from "@/lib/data/portfolio";
import { prisma } from "@/lib/prisma";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findMany: vi.fn(), findFirst: vi.fn() },
    rentalStageRecord: { findMany: vi.fn() },
  },
}));

const mockedPropertyFindMany = vi.mocked(prisma.property.findMany);
const mockedPropertyFindFirst = vi.mocked(prisma.property.findFirst);
const mockedStageFindMany = vi.mocked(prisma.rentalStageRecord.findMany);

const TENANT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  mockedPropertyFindMany.mockReset();
  mockedPropertyFindFirst.mockReset();
  mockedStageFindMany.mockReset().mockResolvedValue([] as never);
});

function propertyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "property-1",
    tenantId: TENANT,
    name: "Villa Elytra",
    address: "Chania, Crete, Greece",
    area: "Chania",
    totalUnits: 1,
    availableUnits: 0,
    deliveryDate: new Date("2026-12-15"),
    contractDate: new Date("2026-03-14"),
    floor: 0,
    sqm: 185,
    energyClass: "A",
    imageUrl: "https://placehold.co/800x450",
    status: "UNDER_CONSTRUCTION",
    listedForRental: false,
    mapUrl: "https://maps.example",
    pptUrl: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    propertyOwnerships: [],
    ...overrides,
  };
}

function ownershipRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user_1",
    saleDate: new Date("2026-03-14"),
    // Prisma hands back a Decimal for numeric columns; a string stands in
    // for one here since Number() is what the module actually calls on it.
    salePrice: "425000.00",
    createdAt: new Date("2026-04-01"),
    user: { id: "user_1", email: "maria@example.com", firstName: "Maria", lastName: "Papadopoulos" },
    ...overrides,
  };
}

describe("getSoldProperties", () => {
  it("asks only for properties that have at least one ownership row", async () => {
    // "Sold" is defined by an ownership row, never by availableUnits <
    // totalUnits: that counter is hand-maintained and can disagree with
    // reality, whereas an ownership row is created only by a real assignment.
    mockedPropertyFindMany.mockResolvedValueOnce([] as never);

    await getSoldProperties(TENANT);

    expect(mockedPropertyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, propertyOwnerships: { some: {} } } }),
    );
  });

  it("maps each buyer with their name, sale date and price", async () => {
    mockedPropertyFindMany.mockResolvedValueOnce([
      propertyRow({ propertyOwnerships: [ownershipRow()] }),
    ] as never);

    const [entry] = await getSoldProperties(TENANT);

    expect(entry.property.name).toBe("Villa Elytra");
    expect(entry.owners).toEqual([
      {
        userId: "user_1",
        name: "Maria Papadopoulos",
        email: "maria@example.com",
        saleDate: "2026-03-14",
        salePrice: 425000,
        recordedAt: new Date("2026-04-01").toISOString(),
      },
    ]);
  });

  it("sums the recorded prices and counts the ones missing, rather than hiding the gap", async () => {
    mockedPropertyFindMany.mockResolvedValueOnce([
      propertyRow({
        propertyOwnerships: [
          ownershipRow(),
          ownershipRow({ userId: "user_2", salePrice: null, user: { id: "user_2", email: "b@example.com", firstName: "Bob", lastName: null } }),
        ],
      }),
    ] as never);

    const [entry] = await getSoldProperties(TENANT);

    expect(entry.totalSaleValue).toBe(425000);
    // A portfolio total computed from partial data is misleading unless the
    // page can say how partial it is.
    expect(entry.ownersMissingSalePrice).toBe(1);
  });

  it("sorts by most recent sale date first", async () => {
    mockedPropertyFindMany.mockResolvedValueOnce([
      propertyRow({ id: "old", propertyOwnerships: [ownershipRow({ saleDate: new Date("2024-01-01") })] }),
      propertyRow({ id: "new", propertyOwnerships: [ownershipRow({ saleDate: new Date("2026-06-01") })] }),
    ] as never);

    const entries = await getSoldProperties(TENANT);

    expect(entries.map((entry) => entry.property.id)).toEqual(["new", "old"]);
  });

  it("falls back to the recorded-in-app date when no sale date is on file", async () => {
    // Falls back rather than sorting the row last: the app timestamp is a
    // real, if weaker, signal of recency and beats an arbitrary position.
    mockedPropertyFindMany.mockResolvedValueOnce([
      propertyRow({ id: "no-date", propertyOwnerships: [ownershipRow({ saleDate: null, createdAt: new Date("2026-07-01") })] }),
      propertyRow({ id: "dated", propertyOwnerships: [ownershipRow({ saleDate: new Date("2026-05-01") })] }),
    ] as never);

    const entries = await getSoldProperties(TENANT);

    expect(entries.map((entry) => entry.property.id)).toEqual(["no-date", "dated"]);
  });

  it("returns an empty list when nothing has been sold", async () => {
    mockedPropertyFindMany.mockResolvedValueOnce([] as never);
    await expect(getSoldProperties(TENANT)).resolves.toEqual([]);
  });
});

describe("getSoldPropertyDetail", () => {
  it("scopes by id AND tenantId in one where clause", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce(null);

    await getSoldPropertyDetail(TENANT, "property-1");

    expect(mockedPropertyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "property-1", tenantId: TENANT } }),
    );
  });

  it("returns the property with its buyers", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce(
      propertyRow({ propertyOwnerships: [ownershipRow()] }) as never,
    );

    const detail = await getSoldPropertyDetail(TENANT, "property-1");

    expect(detail?.owners).toHaveLength(1);
    expect(detail?.totalSaleValue).toBe(425000);
  });

  it("returns null for a property that exists but has never been sold", async () => {
    // Not an entry with an empty owner list: the caller is a "sold property"
    // page, and rendering it for an unsold one would state something untrue.
    mockedPropertyFindFirst.mockResolvedValueOnce(propertyRow() as never);

    await expect(getSoldPropertyDetail(TENANT, "property-1")).resolves.toBeNull();
  });

  it("returns null for a property in another tenant", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce(null);
    await expect(getSoldPropertyDetail(TENANT, "property-1")).resolves.toBeNull();
  });
});

describe("getRentalInventory", () => {
  it("is driven by the listedForRental flag, not by the presence of stage records", async () => {
    mockedPropertyFindMany.mockResolvedValueOnce([] as never);

    await getRentalInventory(TENANT);

    expect(mockedPropertyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, listedForRental: true } }),
    );
  });

  it("shows a listed property with no owner as unassigned rather than omitting it", async () => {
    // This row is the whole point of the explicit flag: before it existed, a
    // unit for rent with nothing started was invisible.
    mockedPropertyFindMany.mockResolvedValueOnce([
      propertyRow({ listedForRental: true, propertyOwnerships: [] }),
    ] as never);

    const [entry] = await getRentalInventory(TENANT);

    expect(entry.client).toBeNull();
    expect(entry.stagesCompleted).toBe(0);
    expect(entry.currentStage).toBeNull();
    expect(entry.stagesTotal).toBe(10);
  });

  it("skips the stage query entirely when no listed property has an owner", async () => {
    mockedPropertyFindMany.mockResolvedValueOnce([
      propertyRow({ listedForRental: true, propertyOwnerships: [] }),
    ] as never);

    await getRentalInventory(TENANT);

    expect(mockedStageFindMany).not.toHaveBeenCalled();
  });

  it("reports the furthest completed stage by the canonical order, not insertion order", async () => {
    mockedPropertyFindMany.mockResolvedValueOnce([
      propertyRow({ listedForRental: true, propertyOwnerships: [ownershipRow()] }),
    ] as never);
    mockedStageFindMany.mockResolvedValueOnce([
      { userId: "user_1", stageKey: "VIEWINGS", stageOrder: 7 },
      { userId: "user_1", stageKey: "KEYS_DELIVERED", stageOrder: 3 },
    ] as never);

    const [entry] = await getRentalInventory(TENANT);

    expect(entry.stagesCompleted).toBe(2);
    expect(entry.currentStage).toBe("Viewings");
    expect(entry.client).toEqual({ userId: "user_1", name: "Maria Papadopoulos", email: "maria@example.com" });
  });

  it("ignores a stage key no longer in the canonical list instead of throwing", async () => {
    // The stage list is business process and expected to change; a retired
    // key must not break the whole page.
    mockedPropertyFindMany.mockResolvedValueOnce([
      propertyRow({ listedForRental: true, propertyOwnerships: [ownershipRow()] }),
    ] as never);
    mockedStageFindMany.mockResolvedValueOnce([
      { userId: "user_1", stageKey: "RETIRED_STAGE", stageOrder: 99 },
    ] as never);

    const [entry] = await getRentalInventory(TENANT);

    expect(entry.currentStage).toBeNull();
    // Still counted: the row exists and something did happen, even though
    // the label can no longer be resolved.
    expect(entry.stagesCompleted).toBe(1);
  });

  it("queries only DONE stage rows, in one call for every client", async () => {
    mockedPropertyFindMany.mockResolvedValueOnce([
      propertyRow({ listedForRental: true, propertyOwnerships: [ownershipRow()] }),
      propertyRow({ id: "property-2", listedForRental: true, propertyOwnerships: [ownershipRow({ userId: "user_2" })] }),
    ] as never);

    await getRentalInventory(TENANT);

    expect(mockedStageFindMany).toHaveBeenCalledTimes(1);
    expect(mockedStageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, userId: { in: ["user_1", "user_2"] }, status: "DONE" },
      }),
    );
  });

  it("emits one row per owner for a property with several", async () => {
    mockedPropertyFindMany.mockResolvedValueOnce([
      propertyRow({
        listedForRental: true,
        propertyOwnerships: [
          ownershipRow(),
          ownershipRow({ userId: "user_2", user: { id: "user_2", email: "b@example.com", firstName: null, lastName: null } }),
        ],
      }),
    ] as never);

    const entries = await getRentalInventory(TENANT);

    expect(entries).toHaveLength(2);
    expect(entries[1].client?.name).toBe("b@example.com");
  });
});
