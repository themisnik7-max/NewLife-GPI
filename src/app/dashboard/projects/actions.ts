"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { createProperty, updateProperty, type PropertyInput } from "@/lib/data/projects";
import {
  createMilestone,
  updateMilestoneStatus,
  type MilestoneEntry,
  type MilestoneInput,
} from "@/lib/data/construction";
import { Role } from "@/lib/auth/role";

/**
 * Every action in this file independently re-checks admin role server-side —
 * never trusts that the "Add Property"/"Edit" controls were merely hidden
 * from a non-admin client, the same reasoning as revokeApiKeyAction in
 * src/app/settings/actions.ts re-resolving identity server-side rather than
 * trusting a client-supplied claim.
 */
async function requireAdmin() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== Role.ADMIN) {
    throw new Error("Admin access required.");
  }
  return currentUser;
}

/**
 * Returns the new property's id rather than calling redirect() itself:
 * PropertyForm (src/components/ui/PropertyForm.tsx) wraps this call in a
 * try/catch to surface validation errors inline, and redirect() works by
 * throwing a special Next.js signal — catching it there would treat a
 * successful creation as a display-able error. The caller (this action's
 * one client-side call site) navigates itself once this genuinely resolves.
 */
export async function createPropertyAction(input: PropertyInput): Promise<{ id: string }> {
  const currentUser = await requireAdmin();
  const created = await createProperty(currentUser.tenantId, input);
  revalidatePath("/dashboard/projects");
  return { id: created.id };
}

export async function updatePropertyAction(propertyId: string, input: Partial<PropertyInput>): Promise<void> {
  const currentUser = await requireAdmin();
  await updateProperty(currentUser.tenantId, propertyId, input);
  revalidatePath(`/dashboard/projects/${propertyId}`);
  revalidatePath("/dashboard/projects");
}

/**
 * Construction milestones live here rather than in a per-client actions
 * file because a milestone describes the *property's* own build progress,
 * shared by every owner — see ConstructionMilestone's doc comment in
 * prisma/schema.prisma, which is also why getPropertyMilestones() takes no
 * userId.
 */
export async function createMilestoneAction(propertyId: string, input: MilestoneInput): Promise<void> {
  const currentUser = await requireAdmin();
  await createMilestone(currentUser.tenantId, propertyId, input);
  revalidatePath(`/dashboard/projects/${propertyId}`);
  revalidatePath("/dashboard/construction");
}

export async function updateMilestoneStatusAction(
  propertyId: string,
  milestoneId: string,
  status: MilestoneEntry["status"],
): Promise<void> {
  const currentUser = await requireAdmin();
  await updateMilestoneStatus(currentUser.tenantId, milestoneId, status);
  revalidatePath(`/dashboard/projects/${propertyId}`);
  revalidatePath("/dashboard/construction");
}
