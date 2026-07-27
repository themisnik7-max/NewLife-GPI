import "server-only";
import { prisma } from "@/lib/prisma";
import { AuditAction, recordAuditEvent, recordFieldChanges, type ActorContext } from "@/lib/data/audit";
import {
  RENTAL_STAGES,
  RENTAL_STAGE_BY_KEY,
  isKnownRentalStage,
  type RentalStageStatus,
  type RentalStageView,
} from "@/lib/rentalStages";

/**
 * Prisma-backed read/write layer for the rental workflow.
 *
 * The canonical stage list lives in src/lib/rentalStages.ts (client-safe);
 * this module merges it with whatever has actually been recorded. Every
 * write here is audited inside the same transaction as the change, so the
 * history of a stage's progression survives the stage being changed again.
 */

const VALID_STATUSES: ReadonlySet<string> = new Set<RentalStageStatus>(["PENDING", "DONE"]);

function toRentalStageStatus(raw: string): RentalStageStatus {
  if (!VALID_STATUSES.has(raw)) {
    throw new Error(`Unrecognized rental stage status from database: ${raw}`);
  }
  return raw as RentalStageStatus;
}

function assertKnownStage(stageKey: string): void {
  if (!isKnownRentalStage(stageKey)) {
    throw new Error(`Unrecognized rental stage key: ${stageKey}`);
  }
}

/**
 * Returns all ten stages in order, merged with any stored progress.
 *
 * Stages with no stored row come back PENDING — that absence *is* the
 * pending state, so no seeding is required and a client who has never been
 * touched still renders a complete, ordered workflow.
 *
 * Rows whose stageKey is no longer in the canonical list are ignored rather
 * than throwing: the list is business process and expected to change, and a
 * removed stage shouldn't break every page that reads it.
 */
export async function getClientRentalStages(tenantId: string, userId: string): Promise<RentalStageView[]> {
  const rows = await prisma.rentalStageRecord.findMany({ where: { tenantId, userId } });
  const byKey = new Map(rows.map((row) => [row.stageKey, row]));

  return RENTAL_STAGES.map((definition) => {
    const row = byKey.get(definition.key);
    return {
      key: definition.key,
      label: definition.label,
      order: definition.order,
      slot: definition.slot,
      hasOfferFields: definition.hasOfferFields ?? false,
      status: row ? toRentalStageStatus(row.status) : "PENDING",
      completedAt: row?.completedAt ? row.completedAt.toISOString() : null,
      attachmentFilename: row?.attachmentFilename ?? null,
      // The storage path itself is deliberately not exposed — downloads go
      // through a short-lived signed URL generated server-side, so a leaked
      // path is not a leaked file.
      hasAttachment: Boolean(row?.attachmentPath),
      offerPrice: row?.offerPrice ? Number(row.offerPrice) : null,
      offerDurationMonths: row?.offerDurationMonths ?? null,
      offerComments: row?.offerComments ?? null,
    };
  });
}

/** Count of completed stages, for the Overview summary card. */
export async function getRentalStageProgress(
  tenantId: string,
  userId: string,
): Promise<{ completed: number; total: number }> {
  const done = await prisma.rentalStageRecord.count({
    where: { tenantId, userId, status: "DONE" },
  });
  return { completed: done, total: RENTAL_STAGES.length };
}

/**
 * Marks a stage DONE or PENDING, creating its row on first touch.
 *
 * `upsert` rather than update: a stage has no row until something happens to
 * it, so the first status change is necessarily a create. `completedAt` is
 * stamped on DONE and cleared otherwise, so a row can never claim a
 * completion time for work that was subsequently reopened.
 */
export async function setRentalStageStatus(
  actor: ActorContext,
  userId: string,
  stageKey: string,
  status: RentalStageStatus,
): Promise<void> {
  assertKnownStage(stageKey);
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Unrecognized rental stage status: ${status}`);
  }

  const definition = RENTAL_STAGE_BY_KEY.get(stageKey)!;
  const tenantId = actor.tenantId;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.rentalStageRecord.findFirst({
      where: { tenantId, userId, stageKey },
      select: { status: true },
    });

    await tx.rentalStageRecord.upsert({
      where: { userId_stageKey: { userId, stageKey } },
      create: {
        tenantId,
        userId,
        stageKey,
        stageOrder: definition.order,
        status,
        completedAt: status === "DONE" ? new Date() : null,
      },
      update: {
        status,
        completedAt: status === "DONE" ? new Date() : null,
      },
    });

    await recordFieldChanges(
      tx,
      {
        tenantId,
        actorUserId: actor.actorUserId,
        entityType: "RentalStageRecord",
        entityId: `${userId}:${stageKey}`,
        metadata: { subjectUserId: userId, stageKey },
      },
      { status: existing?.status ?? "PENDING" },
      { status },
    );
  });
}

export interface OfferDetailsInput {
  price?: number | null;
  durationMonths?: number | null;
  comments?: string | null;
}

/**
 * Records the structured terms of the OFFER stage.
 *
 * Duration is an integer month count rather than free text specifically so
 * it stays analysable — "how long are the leases we actually agree?" is a
 * question this data should be able to answer without parsing prose.
 */
export async function setOfferDetails(
  actor: ActorContext,
  userId: string,
  input: OfferDetailsInput,
): Promise<void> {
  const stageKey = "OFFER";
  const definition = RENTAL_STAGE_BY_KEY.get(stageKey)!;
  const tenantId = actor.tenantId;

  if (input.price !== undefined && input.price !== null) {
    if (!Number.isFinite(input.price) || input.price <= 0) {
      throw new Error("Offer price must be a positive, finite number.");
    }
  }
  if (input.durationMonths !== undefined && input.durationMonths !== null) {
    if (!Number.isInteger(input.durationMonths) || input.durationMonths <= 0) {
      throw new Error("Offer duration must be a positive whole number of months.");
    }
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.rentalStageRecord.findFirst({
      where: { tenantId, userId, stageKey },
      select: { offerPrice: true, offerDurationMonths: true, offerComments: true },
    });

    await tx.rentalStageRecord.upsert({
      where: { userId_stageKey: { userId, stageKey } },
      create: {
        tenantId,
        userId,
        stageKey,
        stageOrder: definition.order,
        offerPrice: input.price ?? null,
        offerDurationMonths: input.durationMonths ?? null,
        offerComments: input.comments ?? null,
      },
      update: {
        offerPrice: input.price ?? null,
        offerDurationMonths: input.durationMonths ?? null,
        offerComments: input.comments ?? null,
      },
    });

    await recordFieldChanges(
      tx,
      {
        tenantId,
        actorUserId: actor.actorUserId,
        entityType: "RentalStageRecord",
        entityId: `${userId}:${stageKey}`,
        metadata: { subjectUserId: userId, stageKey },
      },
      {
        offerPrice: existing?.offerPrice ? Number(existing.offerPrice) : null,
        offerDurationMonths: existing?.offerDurationMonths ?? null,
        offerComments: existing?.offerComments ?? null,
      },
      {
        offerPrice: input.price ?? null,
        offerDurationMonths: input.durationMonths ?? null,
        offerComments: input.comments ?? null,
      },
    );
  });
}

/**
 * Attaches an uploaded file to a stage. The caller is responsible for having
 * already stored the object; this records where it landed.
 *
 * The stage must actually have a slot — attaching a PDF to "Keys Delivered"
 * is a programming error, not a user one, so it throws rather than silently
 * storing an orphan path nothing will ever render.
 */
export async function attachRentalStageFile(
  actor: ActorContext,
  userId: string,
  stageKey: string,
  attachment: { path: string; filename: string },
): Promise<void> {
  assertKnownStage(stageKey);
  const definition = RENTAL_STAGE_BY_KEY.get(stageKey)!;
  if (definition.slot === "none") {
    throw new Error(`Rental stage ${stageKey} does not accept a file attachment.`);
  }

  const tenantId = actor.tenantId;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.rentalStageRecord.findFirst({
      where: { tenantId, userId, stageKey },
      select: { attachmentFilename: true },
    });

    await tx.rentalStageRecord.upsert({
      where: { userId_stageKey: { userId, stageKey } },
      create: {
        tenantId,
        userId,
        stageKey,
        stageOrder: definition.order,
        attachmentPath: attachment.path,
        attachmentFilename: attachment.filename,
      },
      update: {
        attachmentPath: attachment.path,
        attachmentFilename: attachment.filename,
      },
    });

    await recordAuditEvent(tx, {
      tenantId,
      actorUserId: actor.actorUserId,
      entityType: "RentalStageRecord",
      entityId: `${userId}:${stageKey}`,
      action: AuditAction.UPDATE,
      field: "attachment",
      oldValue: existing?.attachmentFilename ?? null,
      newValue: attachment.filename,
      metadata: { subjectUserId: userId, stageKey },
    });
  });
}

/** Resolves a stage's stored object path, for generating a signed URL. */
export async function getRentalStageAttachmentPath(
  tenantId: string,
  userId: string,
  stageKey: string,
): Promise<string | null> {
  const row = await prisma.rentalStageRecord.findFirst({
    where: { tenantId, userId, stageKey },
    select: { attachmentPath: true },
  });
  return row?.attachmentPath ?? null;
}
