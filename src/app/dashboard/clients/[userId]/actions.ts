"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { assignPropertyToClient, updateRentalStage } from "@/lib/data/propertyOwnership";
import { createVisaStep, updateVisaStepStatus, type VisaStepEntry } from "@/lib/data/visa";
import { createLedgerEntry } from "@/lib/data/ledgers";
import type { RentalStage } from "@/components/ui/RentalRoadmap";
import { Role } from "@/lib/auth/role";

/**
 * Every action here re-checks admin role server-side rather than trusting
 * that the controls were merely hidden from a non-admin client — the same
 * reasoning as src/app/dashboard/projects/actions.ts's own requireAdmin().
 *
 * `tenantId` always comes from the signed-in admin's own resolved session,
 * never from a parameter: that is what stops a crafted request naming a
 * userId in some other tenant from writing across the boundary, since
 * Prisma bypasses RLS entirely (see ARCHITECTURE.md).
 */
async function requireAdmin() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== Role.ADMIN) {
    throw new Error("Admin access required.");
  }
  return currentUser;
}

function revalidateClientViews(userId: string): void {
  revalidatePath(`/dashboard/clients/${userId}`);
  revalidatePath("/dashboard");
}

export async function assignPropertyAction(userId: string, propertyId: string): Promise<void> {
  const currentUser = await requireAdmin();
  await assignPropertyToClient(currentUser.tenantId, userId, propertyId);
  revalidateClientViews(userId);
}

export async function updateRentalStageAction(userId: string, stage: RentalStage): Promise<void> {
  const currentUser = await requireAdmin();
  await updateRentalStage(currentUser.tenantId, userId, stage);
  revalidateClientViews(userId);
}

export async function createVisaStepAction(
  userId: string,
  input: { title: string; description?: string | null },
): Promise<void> {
  const currentUser = await requireAdmin();
  await createVisaStep(currentUser.tenantId, userId, input);
  revalidateClientViews(userId);
}

export async function updateVisaStepStatusAction(
  userId: string,
  visaStepId: string,
  status: VisaStepEntry["status"],
): Promise<void> {
  const currentUser = await requireAdmin();
  await updateVisaStepStatus(currentUser.tenantId, visaStepId, status);
  revalidateClientViews(userId);
}

export async function createLedgerEntryAction(
  userId: string,
  propertyId: string,
  amount: number,
  dueDate: string,
): Promise<void> {
  const currentUser = await requireAdmin();
  await createLedgerEntry(currentUser.tenantId, propertyId, userId, amount, dueDate);
  revalidateClientViews(userId);
}
