"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { deleteSavedView, saveView } from "@/lib/data/savedViews";
import { parseViewConfig } from "@/lib/views";

/**
 * Saved-view actions.
 *
 * Deliberately NOT admin-gated, unlike every other action module here. A
 * saved view is personal working state scoped to whoever created it, and the
 * data layer keys every read and write on the caller's own user id (see
 * src/lib/data/savedViews.ts) — so any signed-in user can only ever touch
 * their own. Requiring admin would be a restriction with nothing behind it.
 *
 * `tenantId` and `userId` come from the session, never from a parameter.
 */

async function requireUser() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Not signed in.");
  }
  return currentUser;
}

export async function saveViewAction(scope: string, name: string, config: unknown): Promise<void> {
  const currentUser = await requireUser();

  // Sanitised at the boundary as well as in the data layer. This value comes
  // straight from the browser and lands in an untyped Json column; parsing it
  // twice is cheap, and the alternative is trusting a client payload.
  await saveView(currentUser.tenantId, currentUser.userId, scope, name, parseViewConfig(config));

  revalidatePath("/dashboard/clients");
}

export async function deleteSavedViewAction(viewId: string): Promise<void> {
  const currentUser = await requireUser();
  await deleteSavedView(currentUser.tenantId, currentUser.userId, viewId);
  revalidatePath("/dashboard/clients");
}
