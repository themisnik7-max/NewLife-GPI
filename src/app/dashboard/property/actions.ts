"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { Role } from "@/lib/auth/role";
import { recordSale } from "@/lib/data/propertyOwnership";
import type { ActorContext } from "@/lib/data/audit";

/**
 * Server Action behind the one-step "Record a sale" dialog.
 *
 * Admin-only, re-checked server-side. `tenantId` and `actorUserId` come from
 * the signed-in session, never from a parameter — `userId` and `propertyId`
 * below are the *subjects* of the sale, and recordSale verifies both belong
 * to the caller's tenant before writing anything.
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

export interface RecordSaleActionInput {
  /** The buyer — a Clerk user id. */
  userId: string;
  propertyId: string;
  /** From a date input: YYYY-MM-DD, or empty. */
  saleDate: string;
  /** From a number input, so it arrives as a string or empty. */
  salePrice: string;
}

export async function recordSaleAction(input: RecordSaleActionInput): Promise<void> {
  const currentUser = await requireAdmin();

  if (!input.userId) throw new Error("Choose a buyer.");
  if (!input.propertyId) throw new Error("Choose a property.");

  const priceText = input.salePrice.trim();
  const salePrice = priceText === "" ? null : Number(priceText);
  if (salePrice !== null && !Number.isFinite(salePrice)) {
    throw new Error("Sale price must be a number.");
  }

  await recordSale(actorFrom(currentUser), input.userId, input.propertyId, {
    // Empty means "not recorded", which is a real and distinct state from
    // zero or today — recordSale stores null and the table shows the gap.
    saleDate: input.saleDate.trim() || null,
    salePrice,
  });

  // Broad on purpose: a recorded sale changes the sold list, the buyer's own
  // pages, and every roll-up that counts sales or sums their value.
  revalidatePath("/dashboard/property");
  revalidatePath(`/dashboard/property/${input.propertyId}`);
  revalidatePath(`/dashboard/clients/${input.userId}`);
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard");
}
