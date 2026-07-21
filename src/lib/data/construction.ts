import "server-only";
import { prisma } from "@/lib/prisma";
import type { ConstructionMilestone } from "@/generated/prisma/client";

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

function toMilestoneEntry(row: ConstructionMilestone): MilestoneEntry {
  return {
    id: row.id,
    propertyId: row.propertyId,
    title: row.title,
    description: row.description,
    status: row.status,
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
