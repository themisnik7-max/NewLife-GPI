import { describe, expect, it, vi } from "vitest";
import { getCurrentRentalStage, getOwnedProperty } from "@/lib/data/propertyOwnership";
import { getSupabaseClient } from "@/lib/supabaseClient";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: vi.fn(),
}));

const mockedGetSupabaseClient = vi.mocked(getSupabaseClient);

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
