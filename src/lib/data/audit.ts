import "server-only";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Append-only audit trail.
 *
 * Every mutation in this application overwrites its row in place, which
 * destroys the previous value. This module records what changed, from what,
 * to what, and by whom — the history that makes questions like "how long
 * does a stage actually take?" answerable, and which cannot be recovered
 * after the fact if it was never written.
 */

export const AuditAction = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Who is performing a mutation, and in which tenant.
 *
 * Passed as an object rather than two positional strings on purpose: several
 * of these functions already take multiple adjacent id parameters
 * (`assignPropertyToClient(tenantId, userId, propertyId)`), and silently
 * transposing an actor id with a subject id would be a security bug that
 * still compiles. Both fields are always resolved server-side from the
 * session via `getCurrentUser()` — never accepted from the client.
 */
export interface ActorContext {
  tenantId: string;
  actorUserId: string;
}

const VALID_ACTIONS: ReadonlySet<string> = new Set(Object.values(AuditAction));

/**
 * What recordAuditEvent writes through.
 *
 * This is Prisma's own transaction-client type rather than a hand-rolled
 * structural one: a looser interface compiles but silently gives up
 * Prisma's checking of the `data` payload, which is exactly the checking
 * that catches a renamed or missing audit column at build time instead of
 * at runtime. Callers pass the `tx` from their own interactive transaction
 * so the audit row commits atomically with the change it describes; the
 * top-level `prisma` client also satisfies this type for the rare
 * standalone write.
 */
export type AuditWriter = Pick<PrismaClient, "auditLog">;

export interface AuditEventInput {
  tenantId: string;
  /** Clerk user id of whoever performed this — always server-resolved. */
  actorUserId: string;
  /** Model name, e.g. "Property", "RentalStageRecord". */
  entityType: string;
  entityId: string;
  action: AuditAction;
  /** For UPDATE: which field changed, and its before/after values. */
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown> | null;
}

/**
 * Values are stringified because this one table spans every model, so no
 * single column type fits. `null`/`undefined` are preserved as SQL NULL
 * rather than becoming the strings "null"/"undefined", which would be
 * indistinguishable from a real value during analysis. Dates go to ISO so
 * they sort and parse predictably.
 */
function toAuditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Writes one audit row.
 *
 * Takes the writer as its first argument specifically so callers pass the
 * `tx` from their own `prisma.$transaction(...)`: the audit row and the
 * change it describes then commit or roll back together. A mutation that
 * succeeded while its audit row silently failed is precisely the gap this
 * feature exists to close, so this must not be fire-and-forget.
 */
export async function recordAuditEvent(writer: AuditWriter, input: AuditEventInput): Promise<void> {
  if (!VALID_ACTIONS.has(input.action)) {
    throw new Error(`Unrecognized audit action: ${input.action}`);
  }
  if (!input.entityType?.trim()) {
    throw new Error("Audit entityType must not be empty.");
  }
  if (!input.entityId?.trim()) {
    throw new Error("Audit entityId must not be empty.");
  }

  await writer.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      field: input.field ?? null,
      oldValue: toAuditValue(input.oldValue),
      newValue: toAuditValue(input.newValue),
      // Prisma types Json columns with its own JsonNull sentinel rather than
      // plain null; the cast keeps the call site readable without loosening
      // any of the checked fields above.
      metadata: (input.metadata ?? undefined) as never,
    },
  });
}

/**
 * Emits one audit row per field that actually changed between `before` and
 * `after`, skipping fields whose value is unchanged.
 *
 * Recording only real changes is what keeps the table analysable: a "set
 * status to DONE" row that was already DONE is noise that would distort any
 * "when did this happen" query built on top of it later.
 */
export async function recordFieldChanges(
  writer: AuditWriter,
  base: Omit<AuditEventInput, "action" | "field" | "oldValue" | "newValue">,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  for (const field of Object.keys(after)) {
    const oldValue = toAuditValue(before[field]);
    const newValue = toAuditValue(after[field]);
    if (oldValue === newValue) continue;

    await recordAuditEvent(writer, {
      ...base,
      action: AuditAction.UPDATE,
      field,
      oldValue: before[field],
      newValue: after[field],
    });
  }
}

export interface AuditEntry {
  id: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

/**
 * Reads a tenant's audit history, most recent first — the query surface for
 * analysis and for any future audit-viewer UI. Optionally narrowed to one
 * entity. Never filtered by actor: an audit trail you can hide your own
 * entries from is not an audit trail.
 */
export async function getAuditTrail(
  tenantId: string,
  options: { entityType?: string; entityId?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId,
      ...(options.entityType ? { entityType: options.entityType } : {}),
      ...(options.entityId ? { entityId: options.entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 100,
  });

  return rows.map((row) => ({
    id: row.id,
    actorUserId: row.actorUserId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action as AuditAction,
    field: row.field,
    oldValue: row.oldValue,
    newValue: row.newValue,
    createdAt: row.createdAt.toISOString(),
  }));
}
