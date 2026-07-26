import "server-only";
import { prisma } from "@/lib/prisma";
import { toProject as toProjectFromPrismaRow } from "@/lib/data/projects";
import type { Project } from "@/lib/projects";
import type { RentalStage } from "@/components/ui/RentalRoadmap";

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

const VALID_RENTAL_STAGES: ReadonlySet<string> = new Set([
  "RESERVATION",
  "SPA_SIGNED",
  "LEGAL_REVIEW",
  "VENDORS_ENGAGED",
  "VISA_SUBMISSION",
  "VISA_APPROVED",
  "CONSTRUCTION_START",
  "INTERIOR_CHOICES",
  "HANDOVER",
  "RENTAL_ACTIVE",
]);

function toRentalStage(rawStage: string): RentalStage {
  if (!VALID_RENTAL_STAGES.has(rawStage)) {
    throw new Error(`Unrecognized rental_stage value from database: ${rawStage}`);
  }
  return rawStage as RentalStage;
}

export interface ClientPropertySnapshot {
  property: Project | null;
  rentalStage: RentalStage | null;
}

/**
 * Resolves a single user's owned property and rental stage in one query.
 *
 * Both live on the same PropertyOwnership row, so they are fetched together
 * rather than as two separate round-trips. Returns nulls (never throws) when
 * the user owns nothing yet — an expected empty state, not an error.
 *
 * Used by every property/rental/construction view, for both a client looking
 * at their own data and an admin drilling into a specific client's — the
 * caller supplies whichever userId it has already authorized.
 */
export async function getClientPropertySnapshot(tenantId: string, userId: string): Promise<ClientPropertySnapshot> {
  const ownership = await prisma.propertyOwnership.findFirst({
    where: { userId, tenantId },
    orderBy: { createdAt: "desc" },
    include: { property: true },
  });

  if (!ownership) {
    return { property: null, rentalStage: null };
  }

  return {
    property: toProjectFromPrismaRow(ownership.property),
    // rentalStage is a Prisma `String` column, not a narrowed enum type (see
    // its comment in prisma/schema.prisma), so it is validated rather than
    // passed straight through.
    rentalStage: toRentalStage(ownership.rentalStage),
  };
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
  tenantId: string,
  userId: string,
  propertyId: string,
): Promise<void> {
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
    return;
  }

  await prisma.propertyOwnership.create({ data: { tenantId, userId, propertyId } });
}

/**
 * Advances (or corrects) a client's rental stage.
 *
 * Targets the client's most recently created ownership row, deliberately
 * matching getClientPropertySnapshot()'s own `orderBy: { createdAt: "desc" }`
 * — otherwise an admin could update a stage that no screen in the app
 * actually displays.
 */
export async function updateRentalStage(
  tenantId: string,
  userId: string,
  newStage: RentalStage,
): Promise<void> {
  // Validates against the same VALID_RENTAL_STAGES set the read path uses,
  // so a bad value fails here rather than landing in the database and
  // throwing on every subsequent read instead.
  toRentalStage(newStage);

  const ownership = await prisma.propertyOwnership.findFirst({
    where: { userId, tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!ownership) {
    throw new Error(`No property ownership was found for user ${userId} in tenant ${tenantId}.`);
  }

  await prisma.propertyOwnership.update({
    where: { id: ownership.id },
    data: { rentalStage: newStage },
  });
}
