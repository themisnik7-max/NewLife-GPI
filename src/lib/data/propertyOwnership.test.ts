import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  assignPropertyToClient,
  getClientPropertySnapshot,
  getCurrentRentalStage,
  getOwnedProperty,
  updateRentalStage,
} from "@/lib/data/propertyOwnership";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { prisma } from "@/lib/prisma";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: vi.fn(),
}));

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

const mockedGetSupabaseClient = vi.mocked(getSupabaseClient);
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

interface QueryResult {
  data: unknown;
  error: unknown;
}

// Mirrors the exact chain propertyOwnership.ts calls:
// .from().select().eq().order().limit().maybeSingle()
// Every link but the last returns the same object so chaining resolves;
// `eq` is a plain vi.fn() (not mockReturnThis-collapsed away) specifically
// so its call arguments stay inspectable per test.
function mockSupabaseQuery(result: QueryResult) {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);

  const from = vi.fn().mockReturnValue(query);
  mockedGetSupabaseClient.mockReturnValue({ from } as never);

  return { from, query };
}

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prop-1",
    name: "Villa Elytra",
    address: "Chania, Crete, Greece",
    area: "Chania",
    total_units: 1,
    available_units: 0,
    delivery_date: "2026-12-15",
    contract_date: "2026-03-14",
    floor: 0,
    sqm: 185,
    energy_class: "A",
    image_url: "https://example.com/villa-elytra.png",
    status: "UNDER_CONSTRUCTION",
    map_url: "https://example.com/map",
    ppt_url: null,
    ...overrides,
  };
}

describe("getOwnedProperty", () => {
  it("passes the caller's token straight into getSupabaseClient", async () => {
    const { from } = mockSupabaseQuery({ data: null, error: null });

    await getOwnedProperty("clerk-token-abc", TENANT_A);

    expect(mockedGetSupabaseClient).toHaveBeenCalledWith("clerk-token-abc");
    expect(from).toHaveBeenCalledWith("property_ownerships");
  });

  it("scopes the query to the given tenantId via an explicit .eq filter (defense-in-depth over RLS)", async () => {
    const { query } = mockSupabaseQuery({ data: null, error: null });

    await getOwnedProperty("token", TENANT_A);

    expect(query.eq).toHaveBeenCalledWith("tenant_id", TENANT_A);
    expect(query.eq).not.toHaveBeenCalledWith("tenant_id", TENANT_B);
  });

  it("orders by most recently created and limits to a single row", async () => {
    const { query } = mockSupabaseQuery({ data: null, error: null });

    await getOwnedProperty("token", TENANT_A);

    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it("returns null when the user has no ownership row", async () => {
    mockSupabaseQuery({ data: null, error: null });

    const result = await getOwnedProperty("token", TENANT_A);

    expect(result).toBeNull();
  });

  it("returns null when the ownership row exists but the joined property is missing", async () => {
    mockSupabaseQuery({ data: { properties: null }, error: null });

    const result = await getOwnedProperty("token", TENANT_A);

    expect(result).toBeNull();
  });

  it("throws instead of silently returning null when Supabase reports an error", async () => {
    // supabase-js resolves errors onto `error` rather than throwing —
    // if getOwnedProperty didn't check this explicitly, a real database
    // error would look identical to "no property found".
    mockSupabaseQuery({ data: null, error: { message: "permission denied for table property_ownerships" } });

    await expect(getOwnedProperty("token", TENANT_A)).rejects.toThrow(
      "permission denied for table property_ownerships",
    );
  });

  it("maps a found row from snake_case to the frontend Project shape", async () => {
    mockSupabaseQuery({ data: { properties: buildRow() }, error: null });

    const result = await getOwnedProperty("token", TENANT_A);

    expect(result).toEqual({
      id: "prop-1",
      name: "Villa Elytra",
      address: "Chania, Crete, Greece",
      area: "Chania",
      totalUnits: 1,
      availableUnits: 0,
      deliveryDate: "2026-12-15",
      contractDate: "2026-03-14",
      floor: 0,
      sqm: 185,
      energyClass: "A",
      imageUrl: "https://example.com/villa-elytra.png",
      status: "UNDER_CONSTRUCTION",
      mapUrl: "https://example.com/map",
      pptUrl: null,
    });
  });

  it("throws on a status value that isn't a recognized PropertyStatus", async () => {
    mockSupabaseQuery({ data: { properties: buildRow({ status: "DEMOLISHED" }) }, error: null });

    await expect(getOwnedProperty("token", TENANT_A)).rejects.toThrow(/Unrecognized property status/);
  });

  it.each(["PLANNING", "COMPLETED"])("accepts %s as a valid PropertyStatus", async (status) => {
    // Closes a pre-existing gap: only UNDER_CONSTRUCTION and the invalid
    // default branch were ever exercised through this Supabase path.
    mockSupabaseQuery({ data: { properties: buildRow({ status }) }, error: null });

    const result = await getOwnedProperty("token", TENANT_A);

    expect(result?.status).toBe(status);
  });

  // Audit finding 3.3: supabase-js's generic type parameters (the
  // `.maybeSingle<...>()` call in propertyOwnership.ts) are compile-time
  // only — nothing validates at runtime that a returned row actually has
  // the shape TypeScript promises. These prove the fix: a bad row throws a
  // clear, traceable error right here instead of silently producing a
  // Project with a `null`/wrong-typed field that only breaks later inside
  // a component's render.
  describe("row shape validation (audit finding 3.3)", () => {
    it("throws when a required string field is missing", async () => {
      mockSupabaseQuery({ data: { properties: buildRow({ name: undefined }) }, error: null });

      await expect(getOwnedProperty("token", TENANT_A)).rejects.toThrow(/missing required field "name"/);
    });

    it("throws when a required string field is null", async () => {
      mockSupabaseQuery({ data: { properties: buildRow({ address: null }) }, error: null });

      await expect(getOwnedProperty("token", TENANT_A)).rejects.toThrow(/missing required field "address"/);
    });

    it("throws when a required number field is the wrong type", async () => {
      mockSupabaseQuery({ data: { properties: buildRow({ sqm: "185" }) }, error: null });

      await expect(getOwnedProperty("token", TENANT_A)).rejects.toThrow(/missing required field "sqm"/);
    });

    it("throws when a required number field is null", async () => {
      mockSupabaseQuery({ data: { properties: buildRow({ total_units: null }) }, error: null });

      await expect(getOwnedProperty("token", TENANT_A)).rejects.toThrow(/missing required field "total_units"/);
    });

    it("does not throw for a completely well-formed row", async () => {
      mockSupabaseQuery({ data: { properties: buildRow() }, error: null });

      await expect(getOwnedProperty("token", TENANT_A)).resolves.not.toBeNull();
    });
  });
});

describe("getCurrentRentalStage", () => {
  it("passes the caller's token straight into getSupabaseClient and queries the right table", async () => {
    const { from } = mockSupabaseQuery({ data: null, error: null });

    await getCurrentRentalStage("clerk-token-abc", TENANT_A);

    expect(mockedGetSupabaseClient).toHaveBeenCalledWith("clerk-token-abc");
    expect(from).toHaveBeenCalledWith("property_ownerships");
  });

  it("scopes the query to the given tenantId", async () => {
    const { query } = mockSupabaseQuery({ data: null, error: null });

    await getCurrentRentalStage("token", TENANT_A);

    expect(query.eq).toHaveBeenCalledWith("tenant_id", TENANT_A);
    expect(query.eq).not.toHaveBeenCalledWith("tenant_id", TENANT_B);
  });

  it("returns null when the user has no ownership row", async () => {
    mockSupabaseQuery({ data: null, error: null });

    const result = await getCurrentRentalStage("token", TENANT_A);

    expect(result).toBeNull();
  });

  it("throws instead of silently returning null when Supabase reports an error", async () => {
    mockSupabaseQuery({ data: null, error: { message: "permission denied" } });

    await expect(getCurrentRentalStage("token", TENANT_A)).rejects.toThrow("permission denied");
  });

  it("returns the real rental_stage value for a found row", async () => {
    mockSupabaseQuery({ data: { rental_stage: "VISA_SUBMISSION" }, error: null });

    const result = await getCurrentRentalStage("token", TENANT_A);

    expect(result).toBe("VISA_SUBMISSION");
  });

  it("throws on an unrecognized rental_stage value", async () => {
    mockSupabaseQuery({ data: { rental_stage: "NOT_A_REAL_STAGE" }, error: null });

    await expect(getCurrentRentalStage("token", TENANT_A)).rejects.toThrow(/Unrecognized rental_stage/);
  });
});

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
