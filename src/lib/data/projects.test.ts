import { describe, expect, it, vi } from "vitest";
import { getActiveProjects, getProjectById } from "@/lib/data/projects";
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
    property: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

const mockedFindMany = vi.mocked(prisma.property.findMany);
const mockedFindFirst = vi.mocked(prisma.property.findFirst);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
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
});
