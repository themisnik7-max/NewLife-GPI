import "server-only";
import { prisma } from "@/lib/prisma";
import { AuditAction, recordAuditEvent, recordFieldChanges, type ActorContext } from "@/lib/data/audit";
import { toDisplayName } from "@/lib/clientName";
import { Role } from "@/lib/auth/role";
import type { VisaStep } from "@/generated/prisma/client";

/**
 * Plain const, not a Prisma-generated enum — VisaStep.status is a Prisma
 * `String` column (see the note on it in prisma/schema.prisma: Prisma 7's
 * "prisma-client" generator requires a real native Postgres enum type for
 * any Prisma `enum` field, which this project's `text + check` migrations
 * never created). Kept as its own local const, matching construction.ts's
 * identical MilestoneStatusValue rather than a shared import — see that
 * file's comment for why.
 */
const MilestoneStatusValue = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;

export interface VisaStepEntry {
  id: string;
  stepOrder: number;
  title: string;
  description: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  completedAt: string | null;
}

// Prisma now returns a raw `string` for this column rather than a narrowed
// enum type, so an unrecognized value throws here explicitly instead of
// silently mistyping the row — this used to be a bare `row.status`
// pass-through, safe only because Prisma's enum type made it a compile-time
// impossibility.
function toVisaStepStatus(status: string): VisaStepEntry["status"] {
  if (
    status !== MilestoneStatusValue.PENDING &&
    status !== MilestoneStatusValue.IN_PROGRESS &&
    status !== MilestoneStatusValue.COMPLETED
  ) {
    throw new Error(`Unrecognized visa step status from database: ${status}`);
  }
  return status;
}

function toVisaStepEntry(row: VisaStep): VisaStepEntry {
  return {
    id: row.id,
    stepOrder: row.stepOrder,
    title: row.title,
    description: row.description,
    status: toVisaStepStatus(row.status),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

/**
 * Fetches a single user's Golden Visa application steps, step-order
 * ascending — the data behind the "Golden Visa" 5-step timeline screen
 * (FRONTEND_SPEC.md).
 *
 * Filters strictly by BOTH tenantId AND userId, the same reasoning as
 * getUserLedger() in ./ledgers.ts: VisaStep.userId is a real, required
 * column (unlike EncryptedApiKey's deliberately tenant-shared design), so
 * there is no reason to accept a userId parameter without actually
 * filtering on it. Prisma bypasses RLS entirely (see ARCHITECTURE.md's
 * "Clerk ↔ Supabase Third-Party Auth" section), so this application-level
 * filter is the real enforcement boundary for this path — the
 * visa_steps_select RLS policy in
 * supabase/migrations/0005_construction_and_visa.sql only ever applies to
 * requests made through PostgREST, which this function never uses.
 */
export async function getUserVisaSteps(tenantId: string, userId: string): Promise<VisaStepEntry[]> {
  const rows = await prisma.visaStep.findMany({
    where: { tenantId, userId },
    orderBy: { stepOrder: "asc" },
  });

  return rows.map(toVisaStepEntry);
}

export interface ClientVisaJourney {
  userId: string;
  name: string;
  email: string;
  steps: VisaStepEntry[];
  completed: number;
  total: number;
}

/**
 * Every client's Golden Visa journey in one pass — the admin roll-up.
 *
 * Includes clients with NO steps yet, returning an empty timeline for them.
 * That is the whole point of a supervisor view: a client whose application
 * has not been started is precisely the one an admin needs to see, and
 * filtering to `visaSteps: { some: {} }` would hide them.
 *
 * Ordered by fewest completed steps first, so whoever is furthest behind
 * appears at the top. Ties break on name for a stable, predictable order
 * rather than whatever the database happens to return.
 *
 * Admin callers only — this returns other users' data and cannot check the
 * session itself. See getUserVisaSteps() above for the single-client
 * equivalent, and ARCHITECTURE.md for why Prisma reads carry no RLS
 * protection.
 */
export async function getTenantVisaOverview(tenantId: string): Promise<ClientVisaJourney[]> {
  const users = await prisma.user.findMany({
    where: { tenantId, role: Role.TENANT },
    include: { visaSteps: { orderBy: { stepOrder: "asc" } } },
  });

  return users
    .map((user) => {
      const steps = user.visaSteps.map(toVisaStepEntry);
      return {
        userId: user.id,
        name: toDisplayName(user.firstName, user.lastName, user.email),
        email: user.email,
        steps,
        completed: steps.filter((step) => step.status === MilestoneStatusValue.COMPLETED).length,
        total: steps.length,
      };
    })
    .sort((a, b) => a.completed - b.completed || a.name.localeCompare(b.name));
}

export interface VisaStepInput {
  title: string;
  description?: string | null;
  stepOrder?: number;
  status?: VisaStepEntry["status"];
}

/**
 * Adds a Golden Visa step to a client's timeline.
 *
 * `stepOrder` defaults to "next after the client's current highest" rather
 * than requiring the admin to track numbering by hand — VisaStep carries a
 * `@@unique([userId, stepOrder])` constraint (see prisma/schema.prisma), so
 * a hand-typed duplicate would otherwise surface as a raw Prisma constraint
 * error. An explicitly-supplied stepOrder is still honored, for inserting
 * a step out of sequence.
 */
export async function createVisaStep(
  actor: ActorContext,
  userId: string,
  input: VisaStepInput,
): Promise<VisaStepEntry> {
  const tenantId = actor.tenantId;
  if (!input.title?.trim()) {
    throw new Error("Visa step title must not be empty.");
  }

  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
  if (!user) {
    throw new Error(`User ${userId} was not found for tenant ${tenantId}.`);
  }

  let stepOrder = input.stepOrder;
  if (stepOrder === undefined) {
    const lastStep = await prisma.visaStep.findFirst({
      where: { tenantId, userId },
      orderBy: { stepOrder: "desc" },
      select: { stepOrder: true },
    });
    stepOrder = (lastStep?.stepOrder ?? 0) + 1;
  } else if (!Number.isInteger(stepOrder) || stepOrder < 1) {
    throw new Error("stepOrder must be a positive integer.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const step = await tx.visaStep.create({
      data: {
        tenantId,
        userId,
        stepOrder,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? MilestoneStatusValue.PENDING,
      },
    });

    await recordAuditEvent(tx, {
      tenantId,
      actorUserId: actor.actorUserId,
      entityType: "VisaStep",
      entityId: step.id,
      action: AuditAction.CREATE,
      metadata: { subjectUserId: userId, stepOrder: step.stepOrder, title: step.title },
    });

    return step;
  });

  return toVisaStepEntry(created);
}

/**
 * Updates a visa step's status, stamping completedAt when it reaches
 * COMPLETED and clearing it otherwise — same reasoning as
 * updateMilestoneStatus() in ./construction.ts.
 */
export async function updateVisaStepStatus(
  actor: ActorContext,
  visaStepId: string,
  status: VisaStepEntry["status"],
): Promise<void> {
  const tenantId = actor.tenantId;
  toVisaStepStatus(status);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.visaStep.findFirst({
      where: { id: visaStepId, tenantId },
      select: { status: true },
    });
    if (!existing) {
      throw new Error(`Visa step ${visaStepId} was not found for tenant ${tenantId}.`);
    }

    await tx.visaStep.updateMany({
      where: { id: visaStepId, tenantId },
      data: {
        status,
        completedAt: status === MilestoneStatusValue.COMPLETED ? new Date() : null,
      },
    });

    await recordFieldChanges(
      tx,
      {
        tenantId,
        actorUserId: actor.actorUserId,
        entityType: "VisaStep",
        entityId: visaStepId,
      },
      { status: existing.status },
      { status },
    );
  });
}
