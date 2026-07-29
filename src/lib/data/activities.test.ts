import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
    activity: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  createActivity,
  deleteActivity,
  getClientVisibleActivities,
  getClientVisibleTimeline,
  getEntityActivities,
  getOpenTasks,
  getRecordTimeline,
  setTaskCompletion,
  updateActivity,
} from "@/lib/data/activities";
import { prisma } from "@/lib/prisma";

const mockedActivityFindMany = vi.mocked(prisma.activity.findMany);
const mockedActivityFindFirst = vi.mocked(prisma.activity.findFirst);
const mockedActivityCreate = vi.mocked(prisma.activity.create);
const mockedActivityUpdateMany = vi.mocked(prisma.activity.updateMany);
const mockedActivityDeleteMany = vi.mocked(prisma.activity.deleteMany);
const mockedAuditFindMany = vi.mocked(prisma.auditLog.findMany);
const mockedAuditCreate = vi.mocked(prisma.auditLog.create);
const mockedUserFindMany = vi.mocked(prisma.user.findMany);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const USER_1 = "user_client1";
const ACTIVITY_1 = "33333333-3333-3333-3333-333333333333";
const ACTOR = { tenantId: TENANT_A, actorUserId: "user_admin" };

const ROW = {
  id: ACTIVITY_1,
  entityType: "User",
  entityId: USER_1,
  type: "CALL",
  subject: "Discussed the offer",
  body: null,
  occurredAt: new Date("2026-07-20T09:00:00Z"),
  dueAt: null,
  completedAt: null,
  visibleToClient: false,
  createdByUserId: "user_admin",
  createdAt: new Date("2026-07-23T09:00:00Z"),
};

beforeEach(() => {
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (tx: unknown) => unknown) => cb(prisma)) as never);
  mockedActivityFindMany.mockReset().mockResolvedValue([] as never);
  mockedActivityFindFirst.mockReset();
  mockedActivityCreate.mockReset().mockResolvedValue(ROW as never);
  mockedActivityUpdateMany.mockReset().mockResolvedValue({ count: 1 } as never);
  mockedActivityDeleteMany.mockReset().mockResolvedValue({ count: 1 } as never);
  mockedAuditFindMany.mockReset().mockResolvedValue([] as never);
  mockedAuditCreate.mockReset().mockResolvedValue({} as never);
  mockedUserFindMany.mockReset().mockResolvedValue([] as never);
});

describe("getEntityActivities vs getClientVisibleActivities", () => {
  it("the admin reader applies no visibility filter", async () => {
    await getEntityActivities(TENANT_A, "User", USER_1);

    const { where } = mockedActivityFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where).toEqual({ tenantId: TENANT_A, entityType: "User", entityId: USER_1 });
  });

  it("the client reader requires the activity to have been shared", async () => {
    // An internal note reads "buyer is stretched, push for a deposit".
    // Surfacing it to the buyer is the worst failure this module can have.
    await getClientVisibleActivities(TENANT_A, "User", USER_1);

    const { where } = mockedActivityFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where).toEqual({
      tenantId: TENANT_A,
      entityType: "User",
      entityId: USER_1,
      visibleToClient: true,
    });
  });

  it("resolves author names in one query and falls back for a departed user", async () => {
    mockedActivityFindMany.mockResolvedValueOnce([
      ROW,
      { ...ROW, id: "a2", createdByUserId: "user_gone" },
    ] as never);
    mockedUserFindMany.mockResolvedValueOnce([
      { id: "user_admin", firstName: "Themis", lastName: "Nikolaou", email: "t@example.com" },
    ] as never);

    const result = await getEntityActivities(TENANT_A, "User", USER_1);

    expect(mockedUserFindMany).toHaveBeenCalledTimes(1);
    expect(result[0].createdByName).toBe("Themis Nikolaou");
    expect(result[1].createdByName).toBe("Unknown");
  });

  it("throws on an activity type the database should never have held", async () => {
    mockedActivityFindMany.mockResolvedValueOnce([{ ...ROW, type: "TELEPATHY" }] as never);

    await expect(getEntityActivities(TENANT_A, "User", USER_1)).rejects.toThrow(
      /Unrecognized activity type/,
    );
  });
});

describe("getRecordTimeline", () => {
  it("merges people's activities with the system's audit rows, newest first", async () => {
    mockedActivityFindMany.mockResolvedValueOnce([ROW] as never);
    mockedAuditFindMany.mockResolvedValueOnce([
      {
        id: "audit-1",
        actorUserId: "user_admin",
        entityType: "RentalStageRecord",
        entityId: USER_1,
        action: "UPDATE",
        field: "status",
        oldValue: "PENDING",
        newValue: "DONE",
        createdAt: new Date("2026-07-25T09:00:00Z"),
      },
    ] as never);

    const timeline = await getRecordTimeline(TENANT_A, "User", USER_1);

    expect(timeline).toHaveLength(2);
    // The audit row is newer, and the activity is filed under occurredAt
    // (20 July), not createdAt (23 July).
    expect(timeline[0].kind).toBe("system");
    expect(timeline[1].kind).toBe("activity");
    expect(timeline[1].at).toBe("2026-07-20T09:00:00.000Z");
  });

  it("renders an audit row as a readable sentence rather than raw columns", async () => {
    mockedAuditFindMany.mockResolvedValueOnce([
      {
        id: "audit-1",
        actorUserId: "user_admin",
        entityType: "RentalStageRecord",
        entityId: USER_1,
        action: "UPDATE",
        field: "status",
        oldValue: "PENDING",
        newValue: "DONE",
        createdAt: new Date("2026-07-25T09:00:00Z"),
      },
    ] as never);
    mockedUserFindMany.mockResolvedValueOnce([
      { id: "user_admin", firstName: "Themis", lastName: null, email: "t@example.com" },
    ] as never);

    const [entry] = await getRecordTimeline(TENANT_A, "User", USER_1);

    expect(entry).toMatchObject({
      kind: "system",
      summary: "changed status from Pending to Done",
      actorName: "Themis",
    });
  });

  it("scopes both halves to the same tenant and record", async () => {
    await getRecordTimeline(TENANT_A, "Property", "prop-1");

    const activityWhere = (mockedActivityFindMany.mock.calls[0][0] as { where: unknown }).where;
    const auditWhere = (mockedAuditFindMany.mock.calls[0][0] as { where: unknown }).where;
    expect(activityWhere).toEqual({ tenantId: TENANT_A, entityType: "Property", entityId: "prop-1" });
    expect(auditWhere).toEqual({ tenantId: TENANT_A, entityType: "Property", entityId: "prop-1" });
  });

  it("looks up every actor from both halves in a single query", async () => {
    mockedActivityFindMany.mockResolvedValueOnce([ROW] as never);
    mockedAuditFindMany.mockResolvedValueOnce([
      {
        id: "audit-1",
        actorUserId: "user_other",
        entityType: "Property",
        entityId: "p",
        action: "CREATE",
        field: null,
        oldValue: null,
        newValue: null,
        createdAt: new Date("2026-07-25T09:00:00Z"),
      },
    ] as never);

    await getRecordTimeline(TENANT_A, "User", USER_1);

    expect(mockedUserFindMany).toHaveBeenCalledTimes(1);
    const { where } = mockedUserFindMany.mock.calls[0][0] as { where: { id: { in: string[] } } };
    expect(where.id.in.sort()).toEqual(["user_admin", "user_other"]);
  });
});

describe("getClientVisibleTimeline", () => {
  it("never reads the audit log at all", async () => {
    mockedActivityFindMany.mockResolvedValueOnce([{ ...ROW, visibleToClient: true }] as never);

    const timeline = await getClientVisibleTimeline(TENANT_A, "User", USER_1);

    // "admin changed sale price from €250,000 to €240,000" in the buyer's own
    // feed would leak negotiating history. This is by design, not an omission.
    expect(mockedAuditFindMany).not.toHaveBeenCalled();
    expect(timeline.every((entry) => entry.kind === "activity")).toBe(true);
  });

  it("still requires each activity to have been shared", async () => {
    await getClientVisibleTimeline(TENANT_A, "User", USER_1);

    const { where } = mockedActivityFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where).toHaveProperty("visibleToClient", true);
  });
});

describe("createActivity", () => {
  const INPUT = { entityType: "User", entityId: USER_1, type: "CALL" as const, subject: "Called" };

  it("takes the tenant and author from the actor, never from the input", async () => {
    await createActivity(ACTOR, INPUT);

    const { data } = mockedActivityCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.tenantId).toBe(TENANT_A);
    expect(data.createdByUserId).toBe("user_admin");
  });

  it("defaults occurredAt to now for a non-task when the author did not say", async () => {
    await createActivity(ACTOR, INPUT);

    const { data } = mockedActivityCreate.mock.calls[0][0] as {
      data: { occurredAt: Date | null; dueAt: Date | null };
    };
    expect(data.occurredAt).toBeInstanceOf(Date);
    expect(data.dueAt).toBeNull();
  });

  it("preserves a back-dated occurrence, which is the point of the column", async () => {
    const friday = new Date("2026-07-24T15:00:00Z");

    await createActivity(ACTOR, { ...INPUT, occurredAt: friday });

    const { data } = mockedActivityCreate.mock.calls[0][0] as { data: { occurredAt: Date } };
    expect(data.occurredAt).toBe(friday);
  });

  it("stores a task with a due date and no occurrence time", async () => {
    const due = new Date("2026-08-01T09:00:00Z");

    await createActivity(ACTOR, { ...INPUT, type: "TASK", dueAt: due });

    const { data } = mockedActivityCreate.mock.calls[0][0] as {
      data: { occurredAt: Date | null; dueAt: Date | null };
    };
    // Carrying both would make timelineTimestampFor()'s precedence
    // meaningless — the row would silently file under the wrong one.
    expect(data.occurredAt).toBeNull();
    expect(data.dueAt).toBe(due);
  });

  it("refuses a task with no due date", async () => {
    await expect(createActivity(ACTOR, { ...INPUT, type: "TASK" })).rejects.toThrow(
      /task needs a due date/,
    );
    expect(mockedActivityCreate).not.toHaveBeenCalled();
  });

  it("refuses an empty subject, an empty entityId and an unknown type", async () => {
    await expect(createActivity(ACTOR, { ...INPUT, subject: "   " })).rejects.toThrow(/subject/);
    await expect(createActivity(ACTOR, { ...INPUT, entityId: "" })).rejects.toThrow(/entityId/);
    await expect(
      createActivity(ACTOR, { ...INPUT, type: "SMS" as never }),
    ).rejects.toThrow(/Unrecognized activity type/);
  });

  it("defaults visibleToClient to false so a forgotten argument under-shares", async () => {
    await createActivity(ACTOR, INPUT);

    const { data } = mockedActivityCreate.mock.calls[0][0] as { data: { visibleToClient: boolean } };
    expect(data.visibleToClient).toBe(false);
  });

  it("trims the subject and normalises a whitespace-only body to null", async () => {
    await createActivity(ACTOR, { ...INPUT, subject: "  Called  ", body: "   " });

    const { data } = mockedActivityCreate.mock.calls[0][0] as {
      data: { subject: string; body: string | null };
    };
    expect(data.subject).toBe("Called");
    expect(data.body).toBeNull();
  });

  it("audits the creation", async () => {
    await createActivity(ACTOR, INPUT);

    const { data } = mockedAuditCreate.mock.calls[0][0] as {
      data: { action: string; entityType: string };
    };
    expect(data.action).toBe("CREATE");
    expect(data.entityType).toBe("Activity");
  });
});

describe("updateActivity", () => {
  beforeEach(() => {
    mockedActivityFindFirst.mockResolvedValue({
      subject: "Called",
      body: "No answer",
      occurredAt: new Date("2026-07-20T09:00:00Z"),
      dueAt: null,
      visibleToClient: false,
    } as never);
  });

  it("scopes the write by id AND tenant in one atomic where", async () => {
    await updateActivity(ACTOR, ACTIVITY_1, { subject: "Called twice" });

    expect(mockedActivityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ACTIVITY_1, tenantId: TENANT_A } }),
    );
  });

  it("refuses to touch another tenant's activity", async () => {
    mockedActivityFindFirst.mockResolvedValueOnce(null as never);

    await expect(updateActivity(ACTOR, ACTIVITY_1, { subject: "x" })).rejects.toThrow(
      /was not found for tenant/,
    );
    expect(mockedActivityUpdateMany).not.toHaveBeenCalled();
  });

  it("leaves omitted fields at their stored values", async () => {
    await updateActivity(ACTOR, ACTIVITY_1, { subject: "Called twice" });

    const { data } = mockedActivityUpdateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.body).toBe("No answer");
    expect(data.visibleToClient).toBe(false);
  });

  it("audits an edit, so 'this note used to say something else' stays answerable", async () => {
    await updateActivity(ACTOR, ACTIVITY_1, { subject: "Called twice" });

    const audited = mockedAuditCreate.mock.calls.map(
      (call) => (call[0] as { data: { field: string; oldValue: string; newValue: string } }).data,
    );
    expect(audited).toContainEqual(
      expect.objectContaining({ field: "subject", oldValue: "Called", newValue: "Called twice" }),
    );
  });

  it("rejects blanking the subject", async () => {
    await expect(updateActivity(ACTOR, ACTIVITY_1, { subject: "  " })).rejects.toThrow(/subject/);
  });
});

describe("setTaskCompletion", () => {
  it("stamps completedAt when completing and clears it when reopening", async () => {
    mockedActivityFindFirst.mockResolvedValue({ type: "TASK", completedAt: null } as never);
    await setTaskCompletion(ACTOR, ACTIVITY_1, true);
    let { data } = mockedActivityUpdateMany.mock.calls[0][0] as { data: { completedAt: Date | null } };
    expect(data.completedAt).toBeInstanceOf(Date);

    mockedActivityUpdateMany.mockClear();
    mockedActivityFindFirst.mockResolvedValue({
      type: "TASK",
      completedAt: new Date("2026-07-25T09:00:00Z"),
    } as never);
    await setTaskCompletion(ACTOR, ACTIVITY_1, false);
    ({ data } = mockedActivityUpdateMany.mock.calls[0][0] as { data: { completedAt: Date | null } });
    expect(data.completedAt).toBeNull();
  });

  it("refuses to complete anything that is not a task", async () => {
    // Completing a "Call" is meaningless, and accepting it silently would put
    // the row in a state no reader expects.
    mockedActivityFindFirst.mockResolvedValue({ type: "CALL", completedAt: null } as never);

    await expect(setTaskCompletion(ACTOR, ACTIVITY_1, true)).rejects.toThrow(
      /Only a task can be completed/,
    );
    expect(mockedActivityUpdateMany).not.toHaveBeenCalled();
  });
});

describe("deleteActivity", () => {
  it("records the subject in the audit trail so the deletion is traceable", async () => {
    mockedActivityFindFirst.mockResolvedValue({
      subject: "Called",
      type: "CALL",
      entityType: "User",
      entityId: USER_1,
    } as never);

    await deleteActivity(ACTOR, ACTIVITY_1);

    expect(mockedActivityDeleteMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_1, tenantId: TENANT_A },
    });
    const { data } = mockedAuditCreate.mock.calls[0][0] as {
      data: { action: string; metadata: Record<string, unknown> };
    };
    expect(data.action).toBe("DELETE");
    expect(data.metadata.subject).toBe("Called");
  });

  it("refuses to delete another tenant's activity", async () => {
    mockedActivityFindFirst.mockResolvedValueOnce(null as never);

    await expect(deleteActivity(ACTOR, ACTIVITY_1)).rejects.toThrow(/was not found for tenant/);
    expect(mockedActivityDeleteMany).not.toHaveBeenCalled();
  });
});

describe("getOpenTasks", () => {
  it("returns only incomplete, dated tasks, soonest first", async () => {
    await getOpenTasks(TENANT_A);

    const call = mockedActivityFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: Record<string, string>;
    };
    expect(call.where).toEqual({
      tenantId: TENANT_A,
      type: "TASK",
      completedAt: null,
      dueAt: { not: null },
    });
    expect(call.orderBy).toEqual({ dueAt: "asc" });
  });

  it("excludes undated tasks rather than guessing their urgency", async () => {
    // dueAt is required on write, so a null here means a row written outside
    // the application — sorting it as if it were urgent would invent data.
    await getOpenTasks(TENANT_A);

    const { where } = mockedActivityFindMany.mock.calls[0][0] as {
      where: { dueAt: { not: null } };
    };
    expect(where.dueAt).toEqual({ not: null });
  });
});
