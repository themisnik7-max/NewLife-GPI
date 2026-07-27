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
    auditLog: {
      create: vi.fn(),
    },
    property: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    constructionMilestone: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    visaStep: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { createMilestone, getPropertyMilestones, updateMilestoneStatus } from "@/lib/data/construction";
import { createVisaStep, getUserVisaSteps, updateVisaStepStatus } from "@/lib/data/visa";
import { prisma } from "@/lib/prisma";

const mockedFindFirstProperty = vi.mocked(prisma.property.findFirst);
const mockedFindFirstUser = vi.mocked(prisma.user.findFirst);
const mockedFindManyMilestones = vi.mocked(prisma.constructionMilestone.findMany);
const mockedCreateMilestone = vi.mocked(prisma.constructionMilestone.create);
const mockedUpdateManyMilestones = vi.mocked(prisma.constructionMilestone.updateMany);
const mockedFindFirstMilestone = vi.mocked(prisma.constructionMilestone.findFirst);
const mockedFindManySteps = vi.mocked(prisma.visaStep.findMany);
const mockedFindFirstStep = vi.mocked(prisma.visaStep.findFirst);
const mockedCreateStep = vi.mocked(prisma.visaStep.create);
const mockedUpdateManySteps = vi.mocked(prisma.visaStep.updateMany);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const PROPERTY_A = "33333333-3333-3333-3333-333333333333";
const USER_1 = "user_abc123";
const ACTOR_A = { tenantId: TENANT_A, actorUserId: "user_admin" };
const ACTOR_B = { tenantId: TENANT_B, actorUserId: "user_admin" };

// Isolation lifecycle note (matching tests/data/businessMetrics.test.ts):
// every mock here is a fresh vi.fn() reset via .mockReset() in beforeEach —
// nothing uses vi.restoreAllMocks()/vi.resetAllMocks(), which would also
// strip the vi.mock() factory bindings above (see
// src/app/api/webhooks/clerk/route.test.ts for why that's avoided).
beforeEach(() => {
  // TX_PASSTHROUGH: every audited mutation now runs inside
  // prisma.$transaction; handing the callback the same mock object keeps
  // each model assertion below valid without rewriting them.
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (tx: unknown) => unknown) => cb(prisma)) as never);
  vi.mocked(prisma.auditLog.create).mockReset().mockResolvedValue({} as never);
  mockedFindFirstProperty.mockReset();
  mockedFindFirstUser.mockReset();
  mockedFindManyMilestones.mockReset();
  mockedCreateMilestone.mockReset();
  mockedUpdateManyMilestones.mockReset();
  mockedFindFirstMilestone.mockReset();
  mockedFindManySteps.mockReset();
  mockedFindFirstStep.mockReset();
  mockedCreateStep.mockReset();
  mockedUpdateManySteps.mockReset();
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

  it("throws on an unrecognized status value from the database, rather than mistyping the row", async () => {
    // ConstructionMilestone.status is a Prisma String column, not a narrowed
    // enum (see the comment on it in prisma/schema.prisma) — a bad value is
    // reachable at runtime and must fail loudly here.
    mockedFindFirstProperty.mockResolvedValueOnce({ id: PROPERTY_A } as never);
    mockedFindManyMilestones.mockResolvedValueOnce([
      {
        id: "milestone-3",
        tenantId: TENANT_A,
        propertyId: PROPERTY_A,
        title: "Bad row",
        description: null,
        status: "ON_HOLD",
        targetDate: new Date("2026-09-01T00:00:00.000Z"),
        completionDate: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);

    await expect(getPropertyMilestones(TENANT_A, PROPERTY_A)).rejects.toThrow(
      /Unrecognized construction milestone status/,
    );
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

  it("throws on an unrecognized status value from the database, rather than mistyping the row", async () => {
    // VisaStep.status is a Prisma String column, not a narrowed enum (see
    // the comment on it in prisma/schema.prisma) — a bad value is reachable
    // at runtime and must fail loudly here.
    mockedFindManySteps.mockResolvedValueOnce([
      {
        id: "step-3",
        tenantId: TENANT_A,
        userId: USER_1,
        stepOrder: 3,
        title: "Bad row",
        description: null,
        status: "ON_HOLD",
        completedAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);

    await expect(getUserVisaSteps(TENANT_A, USER_1)).rejects.toThrow(/Unrecognized visa step status/);
  });
});

const MILESTONE_ROW = {
  id: "milestone-new",
  tenantId: TENANT_A,
  propertyId: PROPERTY_A,
  title: "Roofing",
  description: null,
  status: "PENDING",
  targetDate: new Date("2026-11-01T00:00:00.000Z"),
  completionDate: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("createMilestone", () => {
  it("creates a milestone once the property is confirmed to belong to the tenant", async () => {
    mockedFindFirstProperty.mockResolvedValueOnce({ id: PROPERTY_A } as never);
    mockedCreateMilestone.mockResolvedValueOnce(MILESTONE_ROW as never);

    await createMilestone(ACTOR_A, PROPERTY_A, { title: "Roofing", targetDate: "2026-11-01" });

    expect(mockedCreateMilestone).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_A,
        propertyId: PROPERTY_A,
        title: "Roofing",
        description: null,
        targetDate: new Date("2026-11-01"),
        status: "PENDING",
      },
    });
  });

  it("THROWS (rather than returning empty like the read path) when writing against another tenant's property", async () => {
    mockedFindFirstProperty.mockResolvedValueOnce(null);

    await expect(createMilestone(ACTOR_B, PROPERTY_A, { title: "X", targetDate: "2026-11-01" })).rejects.toThrow(
      /was not found for tenant/,
    );
    expect(mockedCreateMilestone).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty title", { title: "   ", targetDate: "2026-11-01" }, /title must not be empty/],
    ["an invalid targetDate", { title: "X", targetDate: "nope" }, /targetDate is not a valid date/],
  ])("rejects %s without touching the database", async (_label, input, expected) => {
    await expect(createMilestone(ACTOR_A, PROPERTY_A, input)).rejects.toThrow(expected);
    expect(mockedFindFirstProperty).not.toHaveBeenCalled();
    expect(mockedCreateMilestone).not.toHaveBeenCalled();
  });
});

describe("updateMilestoneStatus", () => {
  it("stamps a completionDate when the milestone reaches COMPLETED", async () => {
    mockedFindFirstMilestone.mockResolvedValueOnce({ status: "PENDING" } as never);
    mockedUpdateManyMilestones.mockResolvedValueOnce({ count: 1 } as never);

    await updateMilestoneStatus(ACTOR_A, "milestone-1", "COMPLETED");

    const callArgs = mockedUpdateManyMilestones.mock.calls[0][0];
    expect(callArgs.where).toEqual({ id: "milestone-1", tenantId: TENANT_A });
    expect(callArgs.data.status).toBe("COMPLETED");
    expect(callArgs.data.completionDate).toBeInstanceOf(Date);
  });

  it("clears completionDate when a milestone is moved back off COMPLETED", async () => {
    // A row must never claim a completion date for work that isn't finished.
    mockedFindFirstMilestone.mockResolvedValueOnce({ status: "COMPLETED" } as never);
    mockedUpdateManyMilestones.mockResolvedValueOnce({ count: 1 } as never);

    await updateMilestoneStatus(ACTOR_A, "milestone-1", "IN_PROGRESS");

    expect(mockedUpdateManyMilestones.mock.calls[0][0].data.completionDate).toBeNull();
  });

  it("throws when the milestone belongs to a different tenant (updateMany matched nothing)", async () => {
    mockedFindFirstMilestone.mockResolvedValueOnce(null);

    await expect(updateMilestoneStatus(ACTOR_B, "milestone-1", "COMPLETED")).rejects.toThrow(
      /was not found for tenant/,
    );
  });

  it("rejects an unrecognized status before writing", async () => {
    await expect(updateMilestoneStatus(ACTOR_A, "milestone-1", "ON_HOLD" as never)).rejects.toThrow(
      /Unrecognized construction milestone status/,
    );
    expect(mockedUpdateManyMilestones).not.toHaveBeenCalled();
  });
});

const STEP_ROW = {
  id: "step-new",
  tenantId: TENANT_A,
  userId: USER_1,
  stepOrder: 3,
  title: "Biometrics appointment",
  description: null,
  status: "PENDING",
  completedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("createVisaStep", () => {
  it("auto-assigns the next stepOrder after the client's current highest", async () => {
    // VisaStep has @@unique([userId, stepOrder]) — hand-typed numbering
    // would otherwise collide and surface as a raw constraint error.
    mockedFindFirstUser.mockResolvedValueOnce({ id: USER_1 } as never);
    mockedFindFirstStep.mockResolvedValueOnce({ stepOrder: 2 } as never);
    mockedCreateStep.mockResolvedValueOnce(STEP_ROW as never);

    await createVisaStep(ACTOR_A, USER_1, { title: "Biometrics appointment" });

    expect(mockedCreateStep).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_A,
        userId: USER_1,
        stepOrder: 3,
        title: "Biometrics appointment",
        description: null,
        status: "PENDING",
      },
    });
  });

  it("starts at stepOrder 1 for a client with no steps yet", async () => {
    mockedFindFirstUser.mockResolvedValueOnce({ id: USER_1 } as never);
    mockedFindFirstStep.mockResolvedValueOnce(null);
    mockedCreateStep.mockResolvedValueOnce(STEP_ROW as never);

    await createVisaStep(ACTOR_A, USER_1, { title: "Submit application" });

    expect(mockedCreateStep.mock.calls[0][0].data.stepOrder).toBe(1);
  });

  it("honors an explicitly supplied stepOrder, for inserting out of sequence", async () => {
    mockedFindFirstUser.mockResolvedValueOnce({ id: USER_1 } as never);
    mockedCreateStep.mockResolvedValueOnce(STEP_ROW as never);

    await createVisaStep(ACTOR_A, USER_1, { title: "Inserted step", stepOrder: 2 });

    expect(mockedFindFirstStep).not.toHaveBeenCalled();
    expect(mockedCreateStep.mock.calls[0][0].data.stepOrder).toBe(2);
  });

  it("throws when the user belongs to a different tenant", async () => {
    mockedFindFirstUser.mockResolvedValueOnce(null);

    await expect(createVisaStep(ACTOR_B, USER_1, { title: "X" })).rejects.toThrow(/was not found for tenant/);
    expect(mockedCreateStep).not.toHaveBeenCalled();
  });

  it("rejects an empty title without touching the database", async () => {
    await expect(createVisaStep(ACTOR_A, USER_1, { title: "  " })).rejects.toThrow(/title must not be empty/);
    expect(mockedFindFirstUser).not.toHaveBeenCalled();
  });

  it("rejects a non-positive explicit stepOrder", async () => {
    mockedFindFirstUser.mockResolvedValueOnce({ id: USER_1 } as never);

    await expect(createVisaStep(ACTOR_A, USER_1, { title: "X", stepOrder: 0 })).rejects.toThrow(
      /stepOrder must be a positive integer/,
    );
    expect(mockedCreateStep).not.toHaveBeenCalled();
  });
});

describe("updateVisaStepStatus", () => {
  it("stamps completedAt when the step reaches COMPLETED", async () => {
    mockedFindFirstStep.mockResolvedValueOnce({ status: "PENDING" } as never);
    mockedUpdateManySteps.mockResolvedValueOnce({ count: 1 } as never);

    await updateVisaStepStatus(ACTOR_A, "step-1", "COMPLETED");

    const callArgs = mockedUpdateManySteps.mock.calls[0][0];
    expect(callArgs.where).toEqual({ id: "step-1", tenantId: TENANT_A });
    expect(callArgs.data.completedAt).toBeInstanceOf(Date);
  });

  it("clears completedAt when a step is moved back off COMPLETED", async () => {
    mockedFindFirstStep.mockResolvedValueOnce({ status: "COMPLETED" } as never);
    mockedUpdateManySteps.mockResolvedValueOnce({ count: 1 } as never);

    await updateVisaStepStatus(ACTOR_A, "step-1", "PENDING");

    expect(mockedUpdateManySteps.mock.calls[0][0].data.completedAt).toBeNull();
  });

  it("throws when the step belongs to a different tenant", async () => {
    mockedFindFirstStep.mockResolvedValueOnce(null);

    await expect(updateVisaStepStatus(ACTOR_B, "step-1", "COMPLETED")).rejects.toThrow(/was not found for tenant/);
  });

  it("rejects an unrecognized status before writing", async () => {
    await expect(updateVisaStepStatus(ACTOR_A, "step-1", "ON_HOLD" as never)).rejects.toThrow(
      /Unrecognized visa step status/,
    );
    expect(mockedUpdateManySteps).not.toHaveBeenCalled();
  });
});
