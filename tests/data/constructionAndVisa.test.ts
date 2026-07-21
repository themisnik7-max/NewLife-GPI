// Covers both new business-data modules in one file, at the path explicitly
// requested for this task: src/lib/data/construction.ts and
// src/lib/data/visa.ts — same deliberate departure from this project's
// co-located-test convention as tests/data/businessMetrics.test.ts, for the
// same reason (an explicit path was requested).

import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only unconditionally throws unless the bundler declares the
// "react-server" export condition, which Vitest's Node/Vite resolution
// never does — both modules under test import it.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: {
      findFirst: vi.fn(),
    },
    constructionMilestone: {
      findMany: vi.fn(),
    },
    visaStep: {
      findMany: vi.fn(),
    },
  },
}));

import { getPropertyMilestones } from "@/lib/data/construction";
import { getUserVisaSteps } from "@/lib/data/visa";
import { prisma } from "@/lib/prisma";

const mockedFindFirstProperty = vi.mocked(prisma.property.findFirst);
const mockedFindManyMilestones = vi.mocked(prisma.constructionMilestone.findMany);
const mockedFindManySteps = vi.mocked(prisma.visaStep.findMany);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const PROPERTY_A = "33333333-3333-3333-3333-333333333333";
const USER_1 = "user_abc123";

// Isolation lifecycle note (matching tests/data/businessMetrics.test.ts):
// every mock here is a fresh vi.fn() reset via .mockReset() in beforeEach —
// nothing uses vi.restoreAllMocks()/vi.resetAllMocks(), which would also
// strip the vi.mock() factory bindings above (see
// src/app/api/webhooks/clerk/route.test.ts for why that's avoided).
beforeEach(() => {
  mockedFindFirstProperty.mockReset();
  mockedFindManyMilestones.mockReset();
  mockedFindManySteps.mockReset();
});

describe("getPropertyMilestones", () => {
  it("returns an empty array without ever querying milestones when the property does not belong to (or does not exist for) the given tenant", async () => {
    mockedFindFirstProperty.mockResolvedValueOnce(null);

    const result = await getPropertyMilestones(TENANT_A, PROPERTY_A);

    expect(result).toEqual([]);
    expect(mockedFindManyMilestones).not.toHaveBeenCalled();
  });

  it("verifies property ownership with an exact {id, tenantId} filter — a property belonging to a different tenant is indistinguishable from one that doesn't exist", async () => {
    mockedFindFirstProperty.mockResolvedValueOnce(null);

    const result = await getPropertyMilestones(TENANT_B, PROPERTY_A);

    expect(mockedFindFirstProperty).toHaveBeenCalledWith({
      where: { id: PROPERTY_A, tenantId: TENANT_B },
      select: { id: true },
    });
    expect(result).toEqual([]);
  });

  it("returns every milestone mapped to ISO dates, once the property is confirmed to belong to the tenant", async () => {
    mockedFindFirstProperty.mockResolvedValueOnce({ id: PROPERTY_A } as never);
    mockedFindManyMilestones.mockResolvedValueOnce([
      {
        id: "milestone-1",
        tenantId: TENANT_A,
        propertyId: PROPERTY_A,
        title: "Foundation poured",
        description: "Site foundation work completed and inspected.",
        status: "IN_PROGRESS",
        targetDate: new Date("2026-09-01T00:00:00.000Z"),
        completionDate: new Date("2026-09-05T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);

    const result = await getPropertyMilestones(TENANT_A, PROPERTY_A);

    expect(result).toEqual([
      {
        id: "milestone-1",
        propertyId: PROPERTY_A,
        title: "Foundation poured",
        description: "Site foundation work completed and inspected.",
        status: "IN_PROGRESS",
        targetDate: "2026-09-01",
        completionDate: "2026-09-05",
      },
    ]);
  });

  it("maps a milestone with no description and no completion date to null for both, rather than throwing or fabricating a value", async () => {
    mockedFindFirstProperty.mockResolvedValueOnce({ id: PROPERTY_A } as never);
    mockedFindManyMilestones.mockResolvedValueOnce([
      {
        id: "milestone-2",
        tenantId: TENANT_A,
        propertyId: PROPERTY_A,
        title: "Roofing",
        description: null,
        status: "PENDING",
        targetDate: new Date("2026-11-01T00:00:00.000Z"),
        completionDate: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);

    const result = await getPropertyMilestones(TENANT_A, PROPERTY_A);

    expect(result[0]?.description).toBeNull();
    expect(result[0]?.completionDate).toBeNull();
  });

  it("returns an empty array when the property exists but has no milestones yet", async () => {
    mockedFindFirstProperty.mockResolvedValueOnce({ id: PROPERTY_A } as never);
    mockedFindManyMilestones.mockResolvedValueOnce([]);

    const result = await getPropertyMilestones(TENANT_A, PROPERTY_A);

    expect(result).toEqual([]);
  });

  it("queries milestones filtered by both propertyId and tenantId, ordered by targetDate ascending", async () => {
    mockedFindFirstProperty.mockResolvedValueOnce({ id: PROPERTY_A } as never);
    mockedFindManyMilestones.mockResolvedValueOnce([]);

    await getPropertyMilestones(TENANT_A, PROPERTY_A);

    expect(mockedFindManyMilestones).toHaveBeenCalledWith({
      where: { propertyId: PROPERTY_A, tenantId: TENANT_A },
      orderBy: { targetDate: "asc" },
    });
  });
});

describe("getUserVisaSteps", () => {
  it("returns every visa step mapped to ISO timestamps, for the given tenant and user", async () => {
    mockedFindManySteps.mockResolvedValueOnce([
      {
        id: "step-1",
        tenantId: TENANT_A,
        userId: USER_1,
        stepOrder: 1,
        title: "Submit application",
        description: "Initial Golden Visa application package submitted to the ministry.",
        status: "COMPLETED",
        completedAt: new Date("2026-02-01T10:30:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T10:30:00.000Z"),
      },
    ] as never);

    const result = await getUserVisaSteps(TENANT_A, USER_1);

    expect(result).toEqual([
      {
        id: "step-1",
        stepOrder: 1,
        title: "Submit application",
        description: "Initial Golden Visa application package submitted to the ministry.",
        status: "COMPLETED",
        completedAt: "2026-02-01T10:30:00.000Z",
      },
    ]);
  });

  it("maps a step with no description and no completedAt to null for both, rather than throwing or fabricating a value", async () => {
    mockedFindManySteps.mockResolvedValueOnce([
      {
        id: "step-2",
        tenantId: TENANT_A,
        userId: USER_1,
        stepOrder: 2,
        title: "Legal review",
        description: null,
        status: "PENDING",
        completedAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);

    const result = await getUserVisaSteps(TENANT_A, USER_1);

    expect(result[0]?.description).toBeNull();
    expect(result[0]?.completedAt).toBeNull();
  });

  it("returns an empty array for a tenant/user combination with no matching steps, rather than throwing an unauthorized error", async () => {
    mockedFindManySteps.mockResolvedValueOnce([]);

    const result = await getUserVisaSteps(TENANT_B, USER_1);

    expect(result).toEqual([]);
  });

  it("queries strictly by both tenantId and userId, ordered by stepOrder ascending — a mismatched tenant or user can never see another's steps", async () => {
    mockedFindManySteps.mockResolvedValueOnce([]);

    await getUserVisaSteps(TENANT_A, USER_1);

    expect(mockedFindManySteps).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A, userId: USER_1 },
      orderBy: { stepOrder: "asc" },
    });
  });
});
