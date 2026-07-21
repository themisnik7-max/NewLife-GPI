"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { revokeTenantApiKey } from "@/lib/data/apiKeys";

/**
 * Bound directly to ApiKeyCard's `onRevoke` prop from the settings page —
 * Next.js allows passing a Server Action as a prop into a Client Component,
 * which can call it like any other async function. tenantId/userId are
 * re-resolved here server-side rather than trusted from any client-supplied
 * value: the Client Component only ever hands this the specific apiKeyId
 * being acted on, never an identity claim of its own.
 */
export async function revokeApiKeyAction(apiKeyId: string): Promise<void> {
  const { userId } = await auth();
  const tenantId = await getCurrentTenantId();

  if (!userId || !tenantId) {
    throw new Error("You must be signed in with a synced account to revoke an API key.");
  }

  await revokeTenantApiKey(tenantId, userId, apiKeyId);
  revalidatePath("/settings");
}
