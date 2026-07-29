"use server";

import { getCurrentUser } from "@/lib/auth/currentTenant";
import { Role } from "@/lib/auth/role";
import { getClientBrief, getPipelineMonitor } from "@/lib/data/insights";
import type { Insight } from "@/lib/data/insights";

/**
 * Server Actions for the two AI features.
 *
 * Both are admin-gated here, and that gate is the entire boundary: the
 * builders in src/lib/data/insights.ts document that they perform no role
 * check of their own, and they are the widest read path in the application
 * *plus* the only one that sends data to a third party.
 *
 * Generated on demand rather than on page load. An AI call costs the tenant
 * real money on their own key — rendering a brief nobody asked for, on every
 * visit to a client page, would bill them for a paragraph nobody read.
 */

async function requireAdmin() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== Role.ADMIN) {
    throw new Error("Admin access required.");
  }
  return currentUser;
}

export async function generatePipelineMonitorAction(): Promise<Insight> {
  const currentUser = await requireAdmin();
  return getPipelineMonitor(currentUser.tenantId);
}

/**
 * `userId` is the SUBJECT, not the caller — an admin asking about someone
 * else. The tenant id still comes from the session, so a crafted request
 * naming a user in another tenant finds nothing.
 */
export async function generateClientBriefAction(userId: string): Promise<Insight> {
  const currentUser = await requireAdmin();
  return getClientBrief(currentUser.tenantId, userId);
}
