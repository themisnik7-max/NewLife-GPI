import "server-only";
import { prisma } from "@/lib/prisma";
import type { Notification } from "@/generated/prisma/client";

export interface NotificationEntry {
  id: string;
  message: string;
  read: boolean;
  createdAt: string;
}

function toNotificationEntry(row: Notification): NotificationEntry {
  return {
    id: row.id,
    message: row.message,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Fetches a user's most recent notifications, newest first — backs the
 * TopNav bell (src/components/ui/TopNav.tsx), which previously had no data
 * behind it at all. Capped at 20: this is a dropdown preview, not a full
 * notification center/pagination view.
 */
export async function getUserNotifications(tenantId: string, userId: string): Promise<NotificationEntry[]> {
  const rows = await prisma.notification.findMany({
    where: { tenantId, userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return rows.map(toNotificationEntry);
}

/**
 * Marks one notification read. Uses `updateMany` with `id` + `tenantId` +
 * `userId` combined in one atomic filter — the same reasoning as
 * revokeTenantApiKey() in ./apiKeys.ts — so a notification id that doesn't
 * actually belong to the calling user is a loud error, not a silent no-op
 * that lets one user mark another user's notification read.
 */
export async function markNotificationRead(tenantId: string, userId: string, notificationId: string): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, tenantId, userId },
    data: { read: true },
  });

  if (result.count === 0) {
    throw new Error(`Notification ${notificationId} was not found for user ${userId} in tenant ${tenantId}.`);
  }
}

/**
 * Creates a notification for a specific user. Internal to the data layer —
 * called from other data-layer functions at the point a real business event
 * happens (e.g. recordTenantPayment() in ./ledgers.ts), not from page code
 * directly.
 */
export async function createNotification(tenantId: string, userId: string, message: string): Promise<void> {
  await prisma.notification.create({ data: { tenantId, userId, message } });
}
