import "server-only";
import { prisma } from "@/lib/prisma";
import { buildMapUrl, buildPlaceholderImageUrl, type Project, type PropertyStatus } from "@/lib/projects";
import { AuditAction, recordAuditEvent, recordFieldChanges, type ActorContext } from "@/lib/data/audit";
import type { Property } from "@/generated/prisma/client";

/**
 * Plain const, not a Prisma-generated enum — Property.status is a Prisma
 * `String` column (see the note on it in prisma/schema.prisma: Prisma 7's
 * "prisma-client" generator requires a real native Postgres enum type for
 * any Prisma `enum` field, which this project's `text + check` migrations
 * never created).
 */
const PropertyStatusValue = {
  PLANNING: "PLANNING",
  UNDER_CONSTRUCTION: "UNDER_CONSTRUCTION",
  COMPLETED: "COMPLETED",
} as const;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Prisma now returns a raw `string` for this column (see the
// PropertyStatusValue comment above) rather than a narrowed enum type, so an
// unrecognized value throws here explicitly instead of being a compile-time
// impossibility the type system no longer actually guarantees.
function toFrontendStatus(status: Property["status"]): PropertyStatus {
  switch (status) {
    case PropertyStatusValue.PLANNING:
    case PropertyStatusValue.UNDER_CONSTRUCTION:
    case PropertyStatusValue.COMPLETED:
      return status;
    default:
      throw new Error(`Unrecognized property status from database: ${status}`);
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

export interface PropertyInput {
  name: string;
  address: string;
  area: string;
  totalUnits: number;
  availableUnits: number;
  deliveryDate: string;
  contractDate: string;
  floor: number;
  sqm: number;
  energyClass: string;
  imageUrl?: string;
  status?: PropertyStatus;
  mapUrl?: string;
  pptUrl?: string | null;
}

const REQUIRED_STRING_FIELDS: Array<keyof PropertyInput> = ["name", "address", "area", "energyClass"];

function validatePropertyInput(input: PropertyInput): void {
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof input[field] !== "string" || !(input[field] as string).trim()) {
      throw new Error(`Property ${field} must not be empty.`);
    }
  }
  if (!Number.isInteger(input.totalUnits) || input.totalUnits < 0) {
    throw new Error("totalUnits must be a non-negative integer.");
  }
  if (!Number.isInteger(input.availableUnits) || input.availableUnits < 0) {
    throw new Error("availableUnits must be a non-negative integer.");
  }
  if (input.availableUnits > input.totalUnits) {
    throw new Error("availableUnits cannot exceed totalUnits.");
  }
  if (!Number.isFinite(input.sqm) || input.sqm <= 0) {
    throw new Error("sqm must be a positive, finite number.");
  }
  if (!Number.isInteger(input.floor)) {
    throw new Error("floor must be an integer.");
  }
  if (Number.isNaN(Date.parse(input.deliveryDate))) {
    throw new Error(`deliveryDate is not a valid date: ${input.deliveryDate}`);
  }
  if (Number.isNaN(Date.parse(input.contractDate))) {
    throw new Error(`contractDate is not a valid date: ${input.contractDate}`);
  }
}

/**
 * Creates a new Property in the browsable catalog for a tenant — the
 * missing counterpart to getActiveProjects()/getProjectById(): before this,
 * nothing anywhere in the app could create a Property row at all; every one
 * that exists came from a one-off manual seeding script.
 *
 * `imageUrl`/`mapUrl` fall back to the same derivations MOCK_PROJECTS itself
 * uses (src/lib/projects.ts's buildPlaceholderImageUrl/buildMapUrl) rather
 * than requiring an admin to source a real photo or hand-type a Maps link —
 * there is no image upload mechanism in this app yet to make a real photo
 * possible, and a Maps link is fully derivable from the address already.
 */
export async function createProperty(actor: ActorContext, input: PropertyInput): Promise<Project> {
  validatePropertyInput(input);

  // The create and its audit row share one transaction so they commit or
  // roll back together — a property that exists with no record of who
  // created it is exactly the gap the audit trail exists to close.
  const created = await prisma.$transaction(async (tx) => {
    const property = await tx.property.create({
      data: {
        tenantId: actor.tenantId,
        name: input.name,
        address: input.address,
        area: input.area,
        totalUnits: input.totalUnits,
        availableUnits: input.availableUnits,
        deliveryDate: new Date(input.deliveryDate),
        contractDate: new Date(input.contractDate),
        floor: input.floor,
        sqm: input.sqm,
        energyClass: input.energyClass,
        imageUrl: input.imageUrl || buildPlaceholderImageUrl(input.name),
        status: input.status ?? "PLANNING",
        mapUrl: input.mapUrl || buildMapUrl(input.address),
        pptUrl: input.pptUrl ?? null,
      },
    });

    await recordAuditEvent(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.actorUserId,
      entityType: "Property",
      entityId: property.id,
      action: AuditAction.CREATE,
      metadata: { name: property.name, address: property.address, status: property.status },
    });

    return property;
  });

  return toProject(created);
}

/**
 * Updates an existing Property, scoped to a tenant.
 *
 * Fetches the existing row first — not just as an existence/tenant-ownership
 * check, but because validating the availableUnits <= totalUnits invariant
 * on a *partial* update requires knowing whichever one of the pair the
 * caller didn't supply (e.g. an admin decrementing availableUnits alone,
 * the single most common real edit, needs validating against the row's
 * existing totalUnits). The actual write still goes through `updateMany`
 * with `id` + `tenantId` combined in one atomic `where` clause, matching
 * revokeTenantApiKey()'s reasoning in ./apiKeys.ts — `update`'s `where` only
 * accepts a single unique field, which would otherwise let a mismatched
 * tenantId slip through unfiltered on the write itself.
 */
export async function updateProperty(
  actor: ActorContext,
  propertyId: string,
  input: Partial<PropertyInput>,
): Promise<Project> {
  const tenantId = actor.tenantId;
  const existing = await prisma.property.findFirst({ where: { id: propertyId, tenantId } });
  if (!existing) {
    throw new Error(`Property ${propertyId} was not found for tenant ${tenantId}.`);
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("Property name must not be empty.");
    data.name = input.name;
  }
  if (input.address !== undefined) {
    if (!input.address.trim()) throw new Error("Property address must not be empty.");
    data.address = input.address;
  }
  if (input.area !== undefined) {
    if (!input.area.trim()) throw new Error("Property area must not be empty.");
    data.area = input.area;
  }
  if (input.energyClass !== undefined) {
    if (!input.energyClass.trim()) throw new Error("Property energyClass must not be empty.");
    data.energyClass = input.energyClass;
  }
  if (input.totalUnits !== undefined) {
    if (!Number.isInteger(input.totalUnits) || input.totalUnits < 0) {
      throw new Error("totalUnits must be a non-negative integer.");
    }
    data.totalUnits = input.totalUnits;
  }
  if (input.availableUnits !== undefined) {
    if (!Number.isInteger(input.availableUnits) || input.availableUnits < 0) {
      throw new Error("availableUnits must be a non-negative integer.");
    }
    data.availableUnits = input.availableUnits;
  }
  const effectiveTotalUnits = input.totalUnits ?? existing.totalUnits;
  const effectiveAvailableUnits = input.availableUnits ?? existing.availableUnits;
  if (effectiveAvailableUnits > effectiveTotalUnits) {
    throw new Error("availableUnits cannot exceed totalUnits.");
  }
  if (input.floor !== undefined) {
    if (!Number.isInteger(input.floor)) throw new Error("floor must be an integer.");
    data.floor = input.floor;
  }
  if (input.sqm !== undefined) {
    if (!Number.isFinite(input.sqm) || input.sqm <= 0) throw new Error("sqm must be a positive, finite number.");
    data.sqm = input.sqm;
  }
  if (input.deliveryDate !== undefined) {
    if (Number.isNaN(Date.parse(input.deliveryDate))) {
      throw new Error(`deliveryDate is not a valid date: ${input.deliveryDate}`);
    }
    data.deliveryDate = new Date(input.deliveryDate);
  }
  if (input.contractDate !== undefined) {
    if (Number.isNaN(Date.parse(input.contractDate))) {
      throw new Error(`contractDate is not a valid date: ${input.contractDate}`);
    }
    data.contractDate = new Date(input.contractDate);
  }
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.status !== undefined) data.status = input.status;
  if (input.mapUrl !== undefined) data.mapUrl = input.mapUrl;
  if (input.pptUrl !== undefined) data.pptUrl = input.pptUrl;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.property.updateMany({
      where: { id: propertyId, tenantId },
      data,
    });

    // One audit row per field that genuinely changed — recordFieldChanges
    // skips no-op writes so the trail stays free of "set X to the value it
    // already had", which would otherwise distort any later timing analysis.
    await recordFieldChanges(
      tx,
      {
        tenantId,
        actorUserId: actor.actorUserId,
        entityType: "Property",
        entityId: propertyId,
      },
      existing as unknown as Record<string, unknown>,
      data,
    );

    return tx.property.findFirst({ where: { id: propertyId, tenantId } });
  });

  if (!updated) {
    throw new Error(`Property ${propertyId} was not found for tenant ${tenantId} after update.`);
  }
  return toProject(updated);
}
