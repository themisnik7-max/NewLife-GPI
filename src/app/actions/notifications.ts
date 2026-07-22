"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { markNotificationRead } from "@/lib/data/notifications";

/**
 * Shared across every page that renders TopNav (see each page.tsx's
 * `onMarkNotificationRead={markNotificationReadAction}`) rather than one
 * copy per page directory — the same Server-Action-as-a-prop pattern
 * already used for revokeApiKeyAction in src/app/settings/actions.ts.
 */
export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("You must be signed in with a synced account to update a notification.");
  }

  await markNotificationRead(currentUser.tenantId, currentUser.userId, notificationId);
  revalidatePath("/", "layout");
}
