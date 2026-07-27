import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProperty, getActiveProjects, getProjectById, updateProperty } from "@/lib/data/projects";
import { prisma } from "@/lib/prisma";

// server-only unconditionally throws unless the bundler declares the
// "react-server" export condition, which Vitest's Node/Vite resolution
// never does — without this mock, importing anything that (transitively)
// imports "server-only" crashes the test at import time, not at assertion
// time. This is the reason this file (and src/lib/auth/currentTenant.ts)
// had zero test coverage before this suite.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
    property: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const mockedFindMany = vi.mocked(prisma.property.findMany);
const mockedFindFirst = vi.mocked(prisma.property.findFirst);
const mockedCreate = vi.mocked(prisma.property.create);
const mockedUpdateMany = vi.mocked(prisma.property.updateMany);

beforeEach(() => {
  // TX_PASSTHROUGH: every audited mutation now runs inside
  // prisma.$transaction; handing the callback the same mock object keeps
  // each model assertion below valid without rewriting them.
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (tx: unknown) => unknown) => cb(prisma)) as never);
  vi.mocked(prisma.auditLog.create).mockReset().mockResolvedValue({} as never);
  mockedFindMany.mockReset();
  mockedFindFirst.mockReset();
  mockedCreate.mockReset();
  mockedUpdateMany.mockReset();
});

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ACTOR_A = { tenantId: TENANT_A, actorUserId: "user_admin" };
const TENANT_B = "22222222-2222-2222-2222-222222222222";

// Deliberately shaped like the real Prisma-generated Property type: Date
// objects for @db.Date columns, not ISO strings — the mapping under test
// (toIsoDate) only does anything meaningful if the input actually needs
// converting.
function buildPrismaProperty(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prop-1",
    tenantId: TENANT_A,
    name: "Test Villa",
    address: "123 Test St, Testville",
    area: "Testville",
    totalUnits: 10,
    availableUnits: 3,
    deliveryDate: new Date("2027-01-15"),
    contractDate: new Date("2026-01-01"),
    floor: 2,
    sqm: 100,
    energyClass: "A",
    imageUrl: "https://example.com/img.png",
    status: "UNDER_CONSTRUCTION",
    mapUrl: "https://example.com/map",
    pptUrl: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("getActiveProjects", () => {
  it("scopes the query to the given tenantId and only available units", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    await getActiveProjects(TENANT_A);

    expect(mockedFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_A,
        availableUnits: { gt: 0 },
      },
      orderBy: { name: "asc" },
    });
  });

  it("never leaks a different tenant's id into the query when called for tenant A", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    await getActiveProjects(TENANT_A);

    const callArgs = mockedFindMany.mock.calls[0][0];
    expect(callArgs?.where).toMatchObject({ tenantId: TENANT_A });
    expect(callArgs?.where).not.toMatchObject({ tenantId: TENANT_B });
  });

  it("maps Prisma's Date fields to plain ISO date strings", async () => {
    mockedFindMany.mockResolvedValueOnce([buildPrismaProperty()] as never);

    const result = await getActiveProjects(TENANT_A);

    expect(result).toEqual([
      {
        id: "prop-1",
        name: "Test Villa",
        address: "123 Test St, Testville",
        area: "Testville",
        totalUnits: 10,
        availableUnits: 3,
        deliveryDate: "2027-01-15",
        contractDate: "2026-01-01",
        floor: 2,
        sqm: 100,
        energyClass: "A",
        imageUrl: "https://example.com/img.png",
        status: "UNDER_CONSTRUCTION",
        mapUrl: "https://example.com/map",
        pptUrl: null,
      },
    ]);
  });

  it("returns an empty array when the tenant has no available properties", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    const result = await getActiveProjects(TENANT_A);

    expect(result).toEqual([]);
  });
});

describe("getProjectById", () => {
  it("scopes the lookup to both id and tenantId together", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await getProjectById("prop-1", TENANT_A);

    expect(mockedFindFirst).toHaveBeenCalledWith({
      where: { id: "prop-1", tenantId: TENANT_A },
    });
  });

  it("returns null rather than another tenant's property when not found in this tenant", async () => {
    // Simulates the property existing, but under a different tenantId —
    // Prisma's own `where: { id, tenantId }` combination is what makes this
    // resolve to null instead of the real row; this test exists so a future
    // refactor that accidentally drops the tenantId condition (e.g.
    // switching to `findUnique({ where: { id } })`) fails loudly here.
    mockedFindFirst.mockResolvedValueOnce(null);

    const result = await getProjectById("prop-1", TENANT_B);

    expect(result).toBeNull();
  });

  it("maps a found property to the frontend Project shape", async () => {
    mockedFindFirst.mockResolvedValueOnce(buildPrismaProperty({ pptUrl: "https://example.com/deck" }) as never);

    const result = await getProjectById("prop-1", TENANT_A);

    expect(result?.pptUrl).toBe("https://example.com/deck");
    expect(result?.status).toBe("UNDER_CONSTRUCTION");
  });

  it("does not filter by availableUnits, unlike getActiveProjects", async () => {
    mockedFindFirst.mockResolvedValueOnce(buildPrismaProperty({ availableUnits: 0 }) as never);

    const result = await getProjectById("prop-1", TENANT_A);

    expect(result).not.toBeNull();
    expect(mockedFindFirst).toHaveBeenCalledWith({
      where: { id: "prop-1", tenantId: TENANT_A },
    });
  });

  it("throws on an unrecognized status value from the database, rather than mistyping the row", async () => {
    // Property.status is a Prisma String column, not a narrowed enum (see
    // the comment on it in prisma/schema.prisma) — a bad value is reachable
    // at runtime and must fail loudly here, not silently mistype the row.
    mockedFindFirst.mockResolvedValueOnce(buildPrismaProperty({ status: "SOLD_OUT" }) as never);

    await expect(getProjectById("prop-1", TENANT_A)).rejects.toThrow(/Unrecognized property status/);
  });
});

const VALID_INPUT = {
  name: "New Villa",
  address: "45 Beach Rd, Paros",
  area: "Paros",
  totalUnits: 5,
  availableUnits: 5,
  deliveryDate: "2027-08-01",
  contractDate: "2026-05-01",
  floor: 1,
  sqm: 90,
  energyClass: "A",
};

describe("createProperty", () => {
  it("creates a property with the exact tenantId + input shape, defaulting status to PLANNING", async () => {
    // The mocked resolved value only needs to be a well-formed Property row
    // so toProject() doesn't crash mapping the return value — the real
    // assertions below are on what was actually passed to prisma.property.create.
    mockedCreate.mockResolvedValueOnce(buildPrismaProperty({ id: "new-prop" }) as never);

    await createProperty(ACTOR_A, VALID_INPUT);

    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_A,
        name: "New Villa",
        address: "45 Beach Rd, Paros",
        totalUnits: 5,
        availableUnits: 5,
        status: "PLANNING",
        pptUrl: null,
      }),
    });
  });

  it("derives imageUrl and mapUrl from name/address when not supplied", async () => {
    mockedCreate.mockResolvedValueOnce(buildPrismaProperty({ id: "new-prop" }) as never);

    await createProperty(ACTOR_A, VALID_INPUT);

    const callArgs = mockedCreate.mock.calls[0][0];
    expect(callArgs.data.imageUrl).toContain("New%20Villa");
    expect(callArgs.data.mapUrl).toContain("45%20Beach%20Rd%2C%20Paros");
  });

  it("uses caller-supplied imageUrl/mapUrl/status/pptUrl instead of deriving them when provided", async () => {
    mockedCreate.mockResolvedValueOnce(buildPrismaProperty({ id: "new-prop" }) as never);

    await createProperty(ACTOR_A, {
      ...VALID_INPUT,
      imageUrl: "https://example.com/real.png",
      mapUrl: "https://example.com/real-map",
      status: "COMPLETED",
      pptUrl: "https://example.com/deck",
    });

    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        imageUrl: "https://example.com/real.png",
        mapUrl: "https://example.com/real-map",
        status: "COMPLETED",
        pptUrl: "https://example.com/deck",
      }),
    });
  });

  it.each([
    ["name", { ...VALID_INPUT, name: "  " }, /name must not be empty/],
    ["address", { ...VALID_INPUT, address: "" }, /address must not be empty/],
    ["totalUnits", { ...VALID_INPUT, totalUnits: -1 }, /totalUnits must be a non-negative integer/],
    ["availableUnits", { ...VALID_INPUT, availableUnits: -1 }, /availableUnits must be a non-negative integer/],
    [
      "availableUnits > totalUnits",
      { ...VALID_INPUT, totalUnits: 2, availableUnits: 3 },
      /availableUnits cannot exceed totalUnits/,
    ],
    ["sqm", { ...VALID_INPUT, sqm: 0 }, /sqm must be a positive, finite number/],
    ["floor", { ...VALID_INPUT, floor: 1.5 }, /floor must be an integer/],
    ["deliveryDate", { ...VALID_INPUT, deliveryDate: "not-a-date" }, /deliveryDate is not a valid date/],
    ["contractDate", { ...VALID_INPUT, contractDate: "not-a-date" }, /contractDate is not a valid date/],
  ])("rejects invalid %s without ever calling prisma.property.create", async (_label, input, expectedError) => {
    await expect(createProperty(ACTOR_A, input)).rejects.toThrow(expectedError);
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe("updateProperty", () => {
  it("throws when the property does not belong to (or does not exist for) the given tenant, without calling updateMany", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await expect(updateProperty(ACTOR_A, "prop-1", { name: "New Name" })).rejects.toThrow(
      /was not found for tenant/,
    );
    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });

  it("updates only the fields the caller supplied, scoped to id + tenantId together", async () => {
    mockedFindFirst.mockResolvedValueOnce(buildPrismaProperty({ availableUnits: 3, totalUnits: 10 }) as never);
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockedFindFirst.mockResolvedValueOnce(buildPrismaProperty({ availableUnits: 2, totalUnits: 10 }) as never);

    await updateProperty(ACTOR_A, "prop-1", { availableUnits: 2 });

    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "prop-1", tenantId: TENANT_A },
      data: { availableUnits: 2 },
    });
  });

  it("validates a partial availableUnits update against the row's EXISTING totalUnits, not just the input", async () => {
    // Regression test: totalUnits isn't part of this call at all, only the
    // existing row's stored value (10) — availableUnits=11 must still be
    // rejected as exceeding it, the single most realistic edit an admin
    // would make (decrementing/adjusting availableUnits alone).
    mockedFindFirst.mockResolvedValueOnce(buildPrismaProperty({ availableUnits: 3, totalUnits: 10 }) as never);

    await expect(updateProperty(ACTOR_A, "prop-1", { availableUnits: 11 })).rejects.toThrow(
      /availableUnits cannot exceed totalUnits/,
    );
    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });

  it("returns the freshly re-fetched, mapped Project after a successful update", async () => {
    mockedFindFirst.mockResolvedValueOnce(buildPrismaProperty({ name: "Old Name" }) as never);
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockedFindFirst.mockResolvedValueOnce(buildPrismaProperty({ name: "Updated Name" }) as never);

    const result = await updateProperty(ACTOR_A, "prop-1", { name: "Updated Name" });

    expect(result.name).toBe("Updated Name");
  });

  it("rejects an empty name without calling updateMany", async () => {
    mockedFindFirst.mockResolvedValueOnce(buildPrismaProperty() as never);

    await expect(updateProperty(ACTOR_A, "prop-1", { name: "   " })).rejects.toThrow(/name must not be empty/);
    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });
});
