"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { updateSaleDetails, type SaleDetailsInput } from "@/lib/data/propertyOwnership";
import { Role } from "@/lib/auth/role";
import type { ActorContext } from "@/lib/data/audit";

/**
 * Re-checks the admin role server-side rather than trusting that the editing
 * controls were merely hidden from a non-admin, matching every other actions
 * file in this app. Prisma bypasses RLS, so this check is the whole boundary.
 */
async function requireAdmin() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== Role.ADMIN) {
    throw new Error("Admin access required.");
  }
  return currentUser;
}

function actorFrom(currentUser: { tenantId: string; userId: string }): ActorContext {
  return { tenantId: currentUser.tenantId, actorUserId: currentUser.userId };
}

/**
 * Records the real sale date and price against one ownership row.
 *
 * `propertyId` is taken only to revalidate the right pages — the write itself
 * is scoped by ownershipId + the session's tenantId inside updateSaleDetails,
 * so a mismatched propertyId cannot widen what gets written.
 */
export async function updateSaleDetailsAction(
  propertyId: string,
  ownershipId: string,
  input: SaleDetailsInput,
): Promise<void> {
  const currentUser = await requireAdmin();
  await updateSaleDetails(actorFrom(currentUser), ownershipId, input);
  revalidatePath(`/dashboard/property/${propertyId}`);
  revalidatePath("/dashboard/property");
  // Sale prices feed the Overview portfolio figure, which would otherwise
  // keep serving a cached total that disagrees with this page.
  revalidatePath("/dashboard");
}
