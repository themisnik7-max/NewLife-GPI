import "server-only";
import { prisma } from "@/lib/prisma";
import { AuditAction, recordAuditEvent, recordFieldChanges, type ActorContext } from "@/lib/data/audit";
import type { ConstructionMilestone } from "@/generated/prisma/client";

/**
 * Plain const, not a Prisma-generated enum — ConstructionMilestone.status is
 * a Prisma `String` column (see the note on it in prisma/schema.prisma:
 * Prisma 7's "prisma-client" generator requires a real native Postgres enum
 * type for any Prisma `enum` field, which this project's `text + check`
 * migrations never created). Kept as its own local const rather than a
 * shared import from visa.ts, even though both columns draw from the same
 * status vocabulary — matching this project's established one-file-one-const
 * convention (see Role/PaymentStatus/ApiKeyStatus).
 */
const MilestoneStatusValue = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;

export interface MilestoneEntry {
  id: string;
  propertyId: string;
  title: string;
  description: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  targetDate: string;
  completionDate: string | null;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Prisma now returns a raw `string` for this column (see the
// MilestoneStatusValue comment above) rather than a narrowed enum type, so an
// unrecognized value throws here explicitly instead of silently mistyping
// the row — this used to be a bare `row.status` pass-through, safe only
// because Prisma's enum type made it a compile-time impossibility.
function toMilestoneStatus(status: string): MilestoneEntry["status"] {
  if (
    status !== MilestoneStatusValue.PENDING &&
    status !== MilestoneStatusValue.IN_PROGRESS &&
    status !== MilestoneStatusValue.COMPLETED
  ) {
    throw new Error(`Unrecognized construction milestone status from database: ${status}`);
  }
  return status;
}

function toMilestoneEntry(row: ConstructionMilestone): MilestoneEntry {
  return {
    id: row.id,
    propertyId: row.propertyId,
    title: row.title,
    description: row.description,
    status: toMilestoneStatus(row.status),
    targetDate: toIsoDate(row.targetDate),
    completionDate: row.completionDate ? toIsoDate(row.completionDate) : null,
  };
}

/**
 * Fetches every construction milestone for a specific property, target-date
 * ascending — the data behind the "Construction" milestone-tracker screen
 * (FRONTEND_SPEC.md).
 *
 * Like getProjectById() in ./projects.ts, Prisma bypasses RLS entirely, so
 * tenant scoping must be enforced here in application code. ConstructionMilestone
 * has its own tenantId column, but a client-supplied propertyId could still
 * name a real property belonging to a *different* tenant — so the property
 * itself is looked up scoped to tenantId FIRST, and only once that lookup
 * confirms the property genuinely belongs to this tenant are its milestones
 * fetched (also re-filtered by tenantId, as defense in depth). Returns an
 * empty array — never an error — for both "property not found" and
 * "property belongs to a different tenant": the caller shouldn't be able to
 * distinguish the two from this function's return value, the same reasoning
 * as getOwnedProperty() in ./propertyOwnership.ts and getDecryptedApiKey()
 * in ./apiKeys.ts.
 */
export async function getPropertyMilestones(tenantId: string, propertyId: string): Promise<MilestoneEntry[]> {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });

  if (!property) {
    return [];
  }

  const rows = await prisma.constructionMilestone.findMany({
    where: { propertyId, tenantId },
    orderBy: { targetDate: "asc" },
  });

  return rows.map(toMilestoneEntry);
}

export interface MilestoneInput {
  title: string;
  description?: string | null;
  targetDate: string;
  status?: MilestoneEntry["status"];
}

/**
 * Adds a construction milestone to a property.
 *
 * Verifies the property belongs to `tenantId` first, exactly as
 * getPropertyMilestones() above does — but throws instead of returning
 * empty: a read of someone else's property should look indistinguishable
 * from "nothing there", while a *write* against one is a real error the
 * caller needs to see.
 */
export async function createMilestone(
  actor: ActorContext,
  propertyId: string,
  input: MilestoneInput,
): Promise<MilestoneEntry> {
  const tenantId = actor.tenantId;
  if (!input.title?.trim()) {
    throw new Error("Milestone title must not be empty.");
  }
  if (Number.isNaN(Date.parse(input.targetDate))) {
    throw new Error(`targetDate is not a valid date: ${input.targetDate}`);
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
  if (!property) {
    throw new Error(`Property ${propertyId} was not found for tenant ${tenantId}.`);
  }

  const created = await prisma.$transaction(async (tx) => {
    const milestone = await tx.constructionMilestone.create({
      data: {
        tenantId,
        propertyId,
        title: input.title,
        description: input.description ?? null,
        targetDate: new Date(input.targetDate),
        status: input.status ?? MilestoneStatusValue.PENDING,
      },
    });

    await recordAuditEvent(tx, {
      tenantId,
      actorUserId: actor.actorUserId,
      entityType: "ConstructionMilestone",
      entityId: milestone.id,
      action: AuditAction.CREATE,
      metadata: { propertyId, title: milestone.title, status: milestone.status },
    });

    return milestone;
  });

  return toMilestoneEntry(created);
}

/**
 * Updates a milestone's status, stamping completionDate automatically when
 * it reaches COMPLETED (and clearing it if moved back off COMPLETED, so the
 * row can't claim a completion date for work that isn't finished).
 *
 * Uses `updateMany` with `id` + `tenantId` combined in one atomic `where`,
 * the same reasoning as revokeTenantApiKey() in ./apiKeys.ts.
 */
export async function updateMilestoneStatus(
  actor: ActorContext,
  milestoneId: string,
  status: MilestoneEntry["status"],
): Promise<void> {
  const tenantId = actor.tenantId;
  toMilestoneStatus(status);

  // The prior status is read inside the transaction so the audit row records
  // the value this update actually replaced, not one a concurrent write
  // could have changed in between.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.constructionMilestone.findFirst({
      where: { id: milestoneId, tenantId },
      select: { status: true },
    });
    if (!existing) {
      throw new Error(`Milestone ${milestoneId} was not found for tenant ${tenantId}.`);
    }

    await tx.constructionMilestone.updateMany({
      where: { id: milestoneId, tenantId },
      data: {
        status,
        completionDate: status === MilestoneStatusValue.COMPLETED ? new Date() : null,
      },
    });

    await recordFieldChanges(
      tx,
      {
        tenantId,
        actorUserId: actor.actorUserId,
        entityType: "ConstructionMilestone",
        entityId: milestoneId,
      },
      { status: existing.status },
      { status },
    );
  });
}
