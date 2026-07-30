import "server-only";
import { prisma } from "@/lib/prisma";
import { AuditAction, recordAuditEvent, recordFieldChanges, type ActorContext } from "@/lib/data/audit";
import {
  activityLabelFor,
  isKnownActivityType,
  sortTimeline,
  summarizeAuditEntry,
  timelineTimestampFor,
  type ActivityType,
  type ActivityView,
  type TimelineEntry,
} from "@/lib/activities";

/**
 * Prisma-backed read/write layer for activities, and the merge that turns
 * activities plus audit rows into one chronological feed.
 *
 * ⚠️ THE TWO-FUNCTION RULE APPLIES HERE TOO, and more sharply than for
 * documents. `getRecordTimeline` (admin) includes system audit rows and
 * internal notes; `getClientVisibleActivities` (the signed-in client)
 * includes neither. An internal note reads "buyer is stretched, push for a
 * deposit" — surfacing it to the buyer is the single worst failure this
 * module can have. Separate exports, never one function with a flag; see
 * ARCHITECTURE.md and the same note in src/lib/data/documents.ts.
 *
 * System audit rows are admin-only unconditionally, with no per-row opt-in.
 * There is no `visibleToClient` on AuditLog and there should not be: those
 * rows are internal operational records (0008 gives that table admin-read
 * policies and no write policies at all), and exposing "admin changed sale
 * price from €X to €Y" to the buyer would leak negotiating history.
 */

const ENTITY_LABELS: Readonly<Record<string, string>> = {
  User: "client",
  Property: "property",
  PaymentLedger: "payment",
  ConstructionMilestone: "milestone",
  RentalStageRecord: "rental stage",
  Document: "document",
  Activity: "activity",
  VisaStep: "visa step",
  PropertyOwnership: "ownership",
  EncryptedApiKey: "API key",
};

interface ActivityRow {
  id: string;
  entityType: string;
  entityId: string;
  type: string;
  subject: string;
  body: string | null;
  occurredAt: Date | null;
  dueAt: Date | null;
  completedAt: Date | null;
  visibleToClient: boolean;
  createdByUserId: string;
  createdAt: Date;
}

const ACTIVITY_SELECT = {
  id: true,
  entityType: true,
  entityId: true,
  type: true,
  subject: true,
  body: true,
  occurredAt: true,
  dueAt: true,
  completedAt: true,
  visibleToClient: true,
  createdByUserId: true,
  createdAt: true,
} as const;

/**
 * Author display names, resolved in one query rather than per row — the same
 * approach and the same reason as resolveUploaderNames() in ./documents.ts:
 * a raw Clerk id in a feed is unreadable, and this table has no relation to
 * User to `include` through, deliberately.
 */
async function resolveActorNames(
  tenantId: string,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  return new Map(
    users.map((user) => [
      user.id,
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email,
    ]),
  );
}

function toActivityType(raw: string): ActivityType {
  if (!isKnownActivityType(raw)) {
    throw new Error(`Unrecognized activity type from database: ${raw}`);
  }
  return raw;
}

function toActivityView(row: ActivityRow, actorNames: Map<string, string>): ActivityView {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    type: toActivityType(row.type),
    typeLabel: activityLabelFor(row.type),
    subject: row.subject,
    body: row.body,
    occurredAt: row.occurredAt ? row.occurredAt.toISOString() : null,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    visibleToClient: row.visibleToClient,
    createdByUserId: row.createdByUserId,
    createdByName: actorNames.get(row.createdByUserId) ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Every activity on one record, newest first.
 *
 * ADMIN ONLY — includes internal notes. Like the other admin-only readers it
 * deliberately does NOT check the session itself; the page performs the role
 * check and calls `notFound()`.
 */
export async function getEntityActivities(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit = 100,
): Promise<ActivityView[]> {
  const rows = await prisma.activity.findMany({
    where: { tenantId, entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: ACTIVITY_SELECT,
  });

  const actorNames = await resolveActorNames(
    tenantId,
    rows.map((row) => row.createdByUserId),
  );
  return rows.map((row) => toActivityView(row, actorNames));
}

/**
 * The activities one client is allowed to see on one record.
 *
 * The counterpart to getEntityActivities, and the only reader a client-facing
 * page may call. `visibleToClient: true` is the entire difference and it is
 * load-bearing — see the module note above.
 */
export async function getClientVisibleActivities(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit = 100,
): Promise<ActivityView[]> {
  const rows = await prisma.activity.findMany({
    where: { tenantId, entityType, entityId, visibleToClient: true },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: ACTIVITY_SELECT,
  });

  const actorNames = await resolveActorNames(
    tenantId,
    rows.map((row) => row.createdByUserId),
  );
  return rows.map((row) => toActivityView(row, actorNames));
}

/**
 * The merged feed: what people did, interleaved with what the system
 * recorded, in one chronological list.
 *
 * ADMIN ONLY — see the module note. This is the feature that makes the
 * existing audit trail visible for the first time: `getAuditTrail()` has been
 * writing and returning correct data since 0008 with nothing rendering it.
 *
 * Both halves are fetched with their own `take` and merged in memory rather
 * than paginated together. A UNION across two tables with different shapes
 * would need raw SQL, which this project does not otherwise use, and the page
 * shows a bounded recent window anyway. The consequence, stated plainly: with
 * more than `limit` of either kind, the merged list is the most recent
 * `limit` of each — not the most recent `limit` overall. For a per-record
 * feed with a default of 50 that is not reachable in practice.
 */
export async function getRecordTimeline(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<TimelineEntry[]> {
  const [activityRows, auditRows] = await Promise.all([
    prisma.activity.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: ACTIVITY_SELECT,
    }),
    prisma.auditLog.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const actorNames = await resolveActorNames(tenantId, [
    ...activityRows.map((row) => row.createdByUserId),
    ...auditRows.map((row) => row.actorUserId),
  ]);

  const activityEntries: TimelineEntry[] = activityRows.map((row) => {
    const activity = toActivityView(row, actorNames);
    return {
      kind: "activity",
      // Filed under when it HAPPENED, not when it was typed — see
      // timelineTimestampFor().
      at: timelineTimestampFor(activity),
      activity,
    };
  });

  const systemEntries: TimelineEntry[] = auditRows.map((row) => ({
    kind: "system",
    at: row.createdAt.toISOString(),
    id: row.id,
    summary: summarizeAuditEntry({
      action: row.action,
      entityType: ENTITY_LABELS[row.entityType] ?? row.entityType,
      field: row.field,
      oldValue: row.oldValue,
      newValue: row.newValue,
    }),
    actorName: actorNames.get(row.actorUserId) ?? "Unknown",
  }));

  return sortTimeline([...activityEntries, ...systemEntries]);
}

/**
 * The client-facing counterpart to getRecordTimeline.
 *
 * Returns the same `TimelineEntry[]` shape so one component renders both
 * audiences, but is built from shared activities ONLY — it never touches
 * AuditLog. That is not an oversight to be "fixed" later by adding a
 * visibility column to audit rows: those rows are internal operational
 * records, and "admin changed sale price from €250,000 to €240,000" in the
 * buyer's own feed would leak negotiating history. A client's timeline is
 * what the business chose to tell them, not a window onto the system.
 */
export async function getClientVisibleTimeline(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<TimelineEntry[]> {
  const activities = await getClientVisibleActivities(tenantId, entityType, entityId, limit);

  return sortTimeline(
    activities.map((activity) => ({
      kind: "activity",
      at: timelineTimestampFor(activity),
      activity,
    })),
  );
}

export interface CreateActivityInput {
  entityType: string;
  entityId: string;
  type: ActivityType;
  subject: string;
  body?: string | null;
  occurredAt?: Date | null;
  dueAt?: Date | null;
  visibleToClient?: boolean;
}

/**
 * Records one activity.
 *
 * A TASK is stamped with `dueAt` and no `occurredAt`; every other type is the
 * reverse, defaulting to now when the author did not say when it happened.
 * Enforcing that split here rather than trusting the caller is what keeps
 * timelineTimestampFor()'s precedence meaningful — a row carrying both would
 * silently file itself under the wrong one.
 */
export async function createActivity(
  actor: ActorContext,
  input: CreateActivityInput,
): Promise<ActivityView> {
  if (!isKnownActivityType(input.type)) {
    throw new Error(`Unrecognized activity type: ${input.type}`);
  }
  if (!input.subject?.trim()) {
    throw new Error("Activity subject must not be empty.");
  }
  if (!input.entityId?.trim()) {
    throw new Error("Activity entityId must not be empty.");
  }

  const isTask = input.type === "TASK";
  if (isTask && !input.dueAt) {
    throw new Error("A task needs a due date.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const activity = await tx.activity.create({
      data: {
        tenantId: actor.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        type: input.type,
        subject: input.subject.trim(),
        body: input.body?.trim() || null,
        occurredAt: isTask ? null : (input.occurredAt ?? new Date()),
        dueAt: isTask ? input.dueAt : null,
        completedAt: null,
        visibleToClient: input.visibleToClient ?? false,
        createdByUserId: actor.actorUserId,
      },
      select: ACTIVITY_SELECT,
    });

    await recordAuditEvent(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.actorUserId,
      entityType: "Activity",
      entityId: activity.id,
      action: AuditAction.CREATE,
      metadata: {
        type: input.type,
        subject: input.subject.trim(),
        subjectEntityType: input.entityType,
        subjectEntityId: input.entityId,
      },
    });

    return activity;
  });

  const actorNames = await resolveActorNames(actor.tenantId, [created.createdByUserId]);
  return toActivityView(created, actorNames);
}

export interface UpdateActivityInput {
  subject?: string;
  body?: string | null;
  occurredAt?: Date | null;
  dueAt?: Date | null;
  visibleToClient?: boolean;
}

/**
 * Corrects an activity.
 *
 * Editable precisely because a person wrote it — the distinction from
 * AuditLog, which has no update path at all. The audit trail still records
 * every edit, so "this note used to say something else" remains answerable.
 *
 * `updateMany` with id AND tenantId in one atomic `where`, same reasoning as
 * updateDocument() and revokeTenantApiKey().
 */
export async function updateActivity(
  actor: ActorContext,
  activityId: string,
  input: UpdateActivityInput,
): Promise<void> {
  if (input.subject !== undefined && !input.subject.trim()) {
    throw new Error("Activity subject must not be empty.");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.activity.findFirst({
      where: { id: activityId, tenantId: actor.tenantId },
      select: {
        subject: true,
        body: true,
        occurredAt: true,
        dueAt: true,
        visibleToClient: true,
      },
    });
    if (!existing) {
      throw new Error(`Activity ${activityId} was not found for tenant ${actor.tenantId}.`);
    }

    const next = {
      subject: input.subject?.trim() ?? existing.subject,
      body: input.body === undefined ? existing.body : (input.body?.trim() || null),
      occurredAt: input.occurredAt === undefined ? existing.occurredAt : input.occurredAt,
      dueAt: input.dueAt === undefined ? existing.dueAt : input.dueAt,
      visibleToClient: input.visibleToClient ?? existing.visibleToClient,
    };

    await tx.activity.updateMany({
      where: { id: activityId, tenantId: actor.tenantId },
      data: next,
    });

    await recordFieldChanges(
      tx,
      {
        tenantId: actor.tenantId,
        actorUserId: actor.actorUserId,
        entityType: "Activity",
        entityId: activityId,
      },
      existing,
      next,
    );
  });
}

/**
 * Marks a task done, or reopens it.
 *
 * Separate from updateActivity because it is the one state change with a
 * downstream consumer — the open-tasks query and, later, the automation
 * engine both read `completedAt`. Rejecting it on a non-task is deliberate:
 * completing a "Call" is meaningless, and silently accepting it would put a
 * row in a state no reader expects.
 */
export async function setTaskCompletion(
  actor: ActorContext,
  activityId: string,
  completed: boolean,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.activity.findFirst({
      where: { id: activityId, tenantId: actor.tenantId },
      select: { type: true, completedAt: true },
    });
    if (!existing) {
      throw new Error(`Activity ${activityId} was not found for tenant ${actor.tenantId}.`);
    }
    if (existing.type !== "TASK") {
      throw new Error("Only a task can be completed.");
    }

    const completedAt = completed ? new Date() : null;

    await tx.activity.updateMany({
      where: { id: activityId, tenantId: actor.tenantId },
      data: { completedAt },
    });

    await recordFieldChanges(
      tx,
      {
        tenantId: actor.tenantId,
        actorUserId: actor.actorUserId,
        entityType: "Activity",
        entityId: activityId,
      },
      { completedAt: existing.completedAt },
      { completedAt },
    );
  });
}

export async function deleteActivity(actor: ActorContext, activityId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.activity.findFirst({
      where: { id: activityId, tenantId: actor.tenantId },
      select: { subject: true, type: true, entityType: true, entityId: true },
    });
    if (!existing) {
      throw new Error(`Activity ${activityId} was not found for tenant ${actor.tenantId}.`);
    }

    await tx.activity.deleteMany({ where: { id: activityId, tenantId: actor.tenantId } });

    await recordAuditEvent(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.actorUserId,
      entityType: "Activity",
      entityId: activityId,
      action: AuditAction.DELETE,
      // Carries the subject so the record that this interaction was logged,
      // and then removed, outlives the row itself.
      metadata: {
        subject: existing.subject,
        type: existing.type,
        subjectEntityType: existing.entityType,
        subjectEntityId: existing.entityId,
      },
    });
  });
}

/**
 * Every open task in the tenant, soonest due first.
 *
 * Tenant-wide and admin-only: this backs the "what needs doing" panel on the
 * admin Overview, which is a business-wide question. A per-user variant would
 * need its own function rather than a parameter here, per the two-function
 * rule — there is no per-user assignment column yet, so it does not exist.
 *
 * Tasks with no due date are excluded rather than sorted last: `dueAt` is
 * required on write for a TASK, so a null here means a row written before
 * that rule or outside the application, and guessing its urgency would be
 * inventing data.
 */
export async function getOpenTasks(tenantId: string, limit = 25): Promise<ActivityView[]> {
  const rows = await prisma.activity.findMany({
    where: {
      tenantId,
      type: "TASK",
      completedAt: null,
      dueAt: { not: null },
    },
    orderBy: { dueAt: "asc" },
    take: limit,
    select: ACTIVITY_SELECT,
  });

  const actorNames = await resolveActorNames(
    tenantId,
    rows.map((row) => row.createdByUserId),
  );
  return rows.map((row) => toActivityView(row, actorNames));
}
