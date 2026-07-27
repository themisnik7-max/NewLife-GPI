import "server-only";
import { prisma } from "@/lib/prisma";
import { toProject as toProjectFromPrismaRow } from "@/lib/data/projects";
import { AuditAction, recordAuditEvent, type ActorContext } from "@/lib/data/audit";
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
export async function assignPropertyToClient(
  actor: ActorContext,
  userId: string,
  propertyId: string,
): Promise<void> {
  const tenantId = actor.tenantId;
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
    const ownership = await tx.propertyOwnership.create({ data: { tenantId, userId, propertyId } });

    await recordAuditEvent(tx, {
      tenantId,
      actorUserId: actor.actorUserId,
      entityType: "PropertyOwnership",
      entityId: ownership.id,
      action: AuditAction.CREATE,
      metadata: { subjectUserId: userId, propertyId },
    });
  });
}

// `updateRentalStage()` was removed here in the 0008 migration. Rental
// progress is no longer a single scalar on this row — see
// src/lib/data/rentalStages.ts for the per-stage replacement.
