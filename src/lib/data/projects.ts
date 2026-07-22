import "server-only";
import { prisma } from "@/lib/prisma";
import type { Project, PropertyStatus } from "@/lib/projects";
import type { Property } from "@/generated/prisma/client";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Prisma's PropertyStatus enum values are already the exact string literals
// PropertyStatus (the frontend type) expects — this function exists as an
// explicit, intentional mapping boundary rather than a silent pass-through,
// so a future enum member added on one side doesn't silently drift from the
// other without a compile error here.
function toFrontendStatus(status: Property["status"]): PropertyStatus {
  switch (status) {
    case "PLANNING":
    case "UNDER_CONSTRUCTION":
    case "COMPLETED":
      return status;
  }
}

export function toProject(property: Property): Project {
  return {
    id: property.id,
    name: property.name,
    address: property.address,
    area: property.area,
    totalUnits: property.totalUnits,
    availableUnits: property.availableUnits,
    deliveryDate: toIsoDate(property.deliveryDate),
    contractDate: toIsoDate(property.contractDate),
    floor: property.floor,
    sqm: property.sqm,
    energyClass: property.energyClass,
    imageUrl: property.imageUrl,
    status: toFrontendStatus(property.status),
    mapUrl: property.mapUrl,
    pptUrl: property.pptUrl,
  };
}

/**
 * Fetches the browsable catalog of properties that still have available
 * units, scoped to a single tenant.
 *
 * `tenantId` is required, not optional: Prisma connects directly to
 * Postgres and is not subject to Supabase RLS (RLS only governs requests
 * made through PostgREST/the Supabase client using auth.jwt()) — so this
 * function is the only thing standing between a caller and every tenant's
 * properties. Resolve the real tenant id server-side via
 * `getCurrentTenantId()` (src/lib/auth/currentTenant.ts) before calling
 * this; never pass through a client-supplied value.
 *
 * "Active" here means "still has at least one available unit" — there is
 * no literal ACTIVE value on PropertyStatus (PLANNING / UNDER_CONSTRUCTION /
 * COMPLETED), so availability, not construction status, is what determines
 * whether a listing belongs in the browsable catalog.
 */
export async function getActiveProjects(tenantId: string): Promise<Project[]> {
  const properties = await prisma.property.findMany({
    where: {
      tenantId,
      availableUnits: { gt: 0 },
    },
    orderBy: { name: "asc" },
  });

  return properties.map(toProject);
}

/**
 * Fetches a single property by id, scoped to a tenant — used by the detail
 * page. Deliberately not filtered by availableUnits like getActiveProjects:
 * a property that sold its last unit between being listed and being viewed
 * should still be viewable, just no longer present in the browsable list.
 * Same tenantId requirement and reasoning as getActiveProjects above.
 */
export async function getProjectById(id: string, tenantId: string): Promise<Project | null> {
  const property = await prisma.property.findFirst({
    where: { id, tenantId },
  });

  return property ? toProject(property) : null;
}
