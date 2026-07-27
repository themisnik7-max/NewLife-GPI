import "server-only";
import { prisma } from "@/lib/prisma";
import { toProject as toProjectFromPrismaRow } from "@/lib/data/projects";
import { AuditAction, recordAuditEvent, recordFieldChanges, type ActorContext } from "@/lib/data/audit";
import { toDisplayName } from "@/lib/clientName";
import type { Project } from "@/lib/projects";

// PostgREST/Supabase-client path removed (2026-07-27). This module was the
// only place in the app that read through `@supabase/supabase-js`; every
// other module already went to Postgres directly through Prisma. The two
// functions that lived here — getOwnedProperty() and getCurrentRentalStage()
// — depended on the Clerk↔Supabase Third-Party Auth integration to verify
// the caller's JWT, which was never configured, so they returned
// "No suitable key or wrong key type" and 500'd the three pages that used
// them (confirmed live against both localhost and production before this
// change). They are replaced by getClientPropertySnapshot() below.
//
// SECURITY NOTE, load-bearing: the removed functions took only a tenantId
// and relied on RLS to silently add `user_id = app.current_clerk_user_id()`.
// Prisma bypasses RLS entirely, so the replacement takes an explicit userId
// and filters on it. Dropping that filter would show whichever tenant member
// happened to be most recent — in this deployment the admin and the demo
// client share one tenant, so it would leak the client's property onto the
// admin's "My Property" page.

export interface ClientPropertySnapshot {
  property: Project | null;
}

/**
 * Resolves a single user's owned property.
 *
 * Returns null (never throws) when the user owns nothing yet — an expected
 * empty state, not an error.
 *
 * Rental progress no longer travels with this: it used to return a
 * `rentalStage` scalar read off the same ownership row, but rental progress
 * is now a set of per-stage records (src/lib/data/rentalStages.ts) that
 * pages fetch separately, since most callers of this function never needed
 * the stage at all.
 */
export async function getClientPropertySnapshot(tenantId: string, userId: string): Promise<ClientPropertySnapshot> {
  const ownership = await prisma.propertyOwnership.findFirst({
    where: { userId, tenantId },
    orderBy: { createdAt: "desc" },
    include: { property: true },
  });

  if (!ownership) {
    return { property: null };
  }

  return { property: toProjectFromPrismaRow(ownership.property) };
}

/**
 * Assigns a property to a client, creating the PropertyOwnership row that
 * every other per-client view reads from (property, rental stage, and the
 * Overview summary all resolve through it).
 *
 * Both the property AND the user are verified to belong to `tenantId`
 * first: this is a Prisma-path write, so RLS provides no protection at all,
 * and a client-supplied id could otherwise name a real row in a different
 * tenant. Idempotent by design — PropertyOwnership has a
 * `@@unique([userId, propertyId])` constraint, so re-assigning a property
 * the client already owns returns the existing row rather than throwing a
 * raw Prisma constraint error at the admin.
 */
/** An ownership row identified for editing, with its current sale facts. */
export interface OwnershipRecord {
  id: string;
  userId: string;
  clientName: string;
  saleDate: string | null;
  salePrice: number | null;
}

/**
 * Lists the ownership rows for one property, for the admin sale-details
 * editor.
 *
 * Returns the ownership *id*, which getSoldPropertyDetail() in ./portfolio.ts
 * deliberately does not: that function feeds a read-only display and has no
 * use for a row id, and updateSaleDetails() needs one because a single client
 * can own several properties, so userId alone does not identify the row to
 * edit.
 */
export async function getOwnershipsForProperty(tenantId: string, propertyId: string): Promise<OwnershipRecord[]> {
  const rows = await prisma.propertyOwnership.findMany({
    where: { tenantId, propertyId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, firstName: true, lastName: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    clientName: toDisplayName(row.user.firstName, row.user.lastName, row.user.email),
    saleDate: row.saleDate ? row.saleDate.toISOString().slice(0, 10) : null,
    salePrice: row.salePrice === null ? null : Number(row.salePrice),
  }));
}

export interface SaleDetailsInput {
  /** ISO date (YYYY-MM-DD) of the actual sale, or null to clear. */
  saleDate?: string | null;
  salePrice?: number | null;
}

/**
 * Validates the commercial facts of a sale.
 *
 * A future sale date is rejected: this records a sale that happened, not one
 * that is planned, and a typo in the year is otherwise indistinguishable from
 * a real entry once it is in the revenue figures. The price rule mirrors the
 * `property_ownerships_sale_price_positive` check added in migration 0009 —
 * enforced in both places on purpose, so the message an admin sees is a
 * sentence rather than a Postgres constraint violation, while the column
 * stays protected against anything that writes to it outside this app.
 */
function validateSaleDetails(input: SaleDetailsInput): void {
  if (input.saleDate !== undefined && input.saleDate !== null) {
    if (Number.isNaN(Date.parse(input.saleDate))) {
      throw new Error(`saleDate is not a valid date: ${input.saleDate}`);
    }
    if (Date.parse(input.saleDate) > Date.now()) {
      throw new Error("saleDate cannot be in the future.");
    }
  }
  if (input.salePrice !== undefined && input.salePrice !== null) {
    if (!Number.isFinite(input.salePrice) || input.salePrice <= 0) {
      throw new Error("salePrice must be a positive, finite number.");
    }
  }
}

export async function assignPropertyToClient(
  actor: ActorContext,
  userId: string,
  propertyId: string,
  sale: SaleDetailsInput = {},
): Promise<void> {
  const tenantId = actor.tenantId;
  validateSaleDetails(sale);
  const [property, user] = await Promise.all([
    prisma.property.findFirst({ where: { id: propertyId, tenantId }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } }),
  ]);

  if (!property) {
    throw new Error(`Property ${propertyId} was not found for tenant ${tenantId}.`);
  }
  if (!user) {
    throw new Error(`User ${userId} was not found for tenant ${tenantId}.`);
  }

  const existing = await prisma.propertyOwnership.findFirst({ where: { userId, propertyId } });
  if (existing) {
    // Already assigned — no state change, so deliberately no audit row.
    // Logging a no-op here would put phantom "assigned" events in the trail
    // for anyone who clicks Assign twice.
    return;
  }

  await prisma.$transaction(async (tx) => {
    const ownership = await tx.propertyOwnership.create({
      data: {
        tenantId,
        userId,
        propertyId,
        saleDate: sale.saleDate ? new Date(sale.saleDate) : null,
        salePrice: sale.salePrice ?? null,
      },
    });

    await recordAuditEvent(tx, {
      tenantId,
      actorUserId: actor.actorUserId,
      entityType: "PropertyOwnership",
      entityId: ownership.id,
      action: AuditAction.CREATE,
      metadata: {
        subjectUserId: userId,
        propertyId,
        saleDate: sale.saleDate ?? null,
        salePrice: sale.salePrice ?? null,
      },
    });
  });
}

/**
 * Records or corrects the sale date and price on an existing ownership.
 *
 * Separate from assignPropertyToClient() because the two happen at different
 * times in practice: an admin assigns a property to give the client access
 * immediately, and the signed contract with its final price arrives later.
 * Requiring both at assignment would push admins toward entering a
 * placeholder price, which is worse than a null — a null is visibly missing,
 * a placeholder is silently wrong.
 *
 * Located here, next to the other PropertyOwnership write, rather than in
 * ./portfolio.ts where it is read: every write in this module sits beside its
 * own audit call, and splitting them would make it easy to add a second
 * writer that forgets one.
 */
export async function updateSaleDetails(
  actor: ActorContext,
  ownershipId: string,
  input: SaleDetailsInput,
): Promise<void> {
  const tenantId = actor.tenantId;
  validateSaleDetails(input);

  const existing = await prisma.propertyOwnership.findFirst({ where: { id: ownershipId, tenantId } });
  if (!existing) {
    throw new Error(`Ownership ${ownershipId} was not found for tenant ${tenantId}.`);
  }

  // Only keys actually supplied are written, so a form editing the price
  // cannot blank a date it never rendered. An explicit null still clears.
  const data: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  if (input.saleDate !== undefined) {
    data.saleDate = input.saleDate ? new Date(input.saleDate) : null;
    after.saleDate = input.saleDate ?? null;
  }
  if (input.salePrice !== undefined) {
    data.salePrice = input.salePrice ?? null;
    after.salePrice = input.salePrice ?? null;
  }

  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.propertyOwnership.updateMany({ where: { id: ownershipId, tenantId }, data });

    await recordFieldChanges(
      tx,
      {
        tenantId,
        actorUserId: actor.actorUserId,
        entityType: "PropertyOwnership",
        entityId: ownershipId,
        metadata: { subjectUserId: existing.userId, propertyId: existing.propertyId },
      },
      {
        saleDate: existing.saleDate ? existing.saleDate.toISOString().slice(0, 10) : null,
        // Decimal → number before comparison: the audit helper stringifies
        // both sides, and Decimal("250000.00") stringifies differently from
        // 250000, which would log a no-op edit as a real change.
        salePrice: existing.salePrice === null ? null : Number(existing.salePrice),
      },
      after,
    );
  });
}

// `updateRentalStage()` was removed here in the 0008 migration. Rental
// progress is no longer a single scalar on this row — see
// src/lib/data/rentalStages.ts for the per-stage replacement.
