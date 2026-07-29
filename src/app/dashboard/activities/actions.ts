"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { Role } from "@/lib/auth/role";
import {
  createActivity,
  deleteActivity,
  setTaskCompletion,
  updateActivity,
} from "@/lib/data/activities";
import { isKnownActivityType, type ActivityType } from "@/lib/activities";
import type { ActorContext } from "@/lib/data/audit";

/**
 * Server Actions for the activity timeline.
 *
 * Every action re-checks admin role server-side rather than trusting that the
 * composer was hidden from a non-admin — the same reasoning as
 * src/app/dashboard/documents/actions.ts. Writing activities is
 * admin/system-controlled in this application: a client cannot log a call
 * against their own record any more than they can advance their own rental
 * stage (see the policy note in 0008_audit_log_and_rental_stages.sql).
 *
 * `tenantId` and `actorUserId` always come from the signed-in admin's own
 * resolved session, never from a parameter.
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
 * Refreshes every page that could be showing this record's feed.
 *
 * Broad rather than surgical, same reasoning as revalidateDocumentViews:
 * showing an admin a timeline that does not contain the note they just wrote
 * reads as a failed save. The dashboard is always included because the open
 * tasks panel lives there and any activity can be a task.
 */
function revalidateActivityViews(entityType: string, entityId: string): void {
  revalidatePath("/dashboard");
  switch (entityType) {
    case "User":
      revalidatePath(`/dashboard/clients/${entityId}`);
      revalidatePath("/dashboard/clients");
      break;
    case "Property":
      revalidatePath(`/dashboard/projects/${entityId}`);
      revalidatePath(`/dashboard/property/${entityId}`);
      revalidatePath("/dashboard/property");
      break;
    case "PaymentLedger":
      revalidatePath("/dashboard/payments");
      break;
    case "ConstructionMilestone":
      revalidatePath("/dashboard/construction");
      break;
  }
}

export interface CreateActivityActionInput {
  entityType: string;
  entityId: string;
  type: string;
  subject: string;
  body?: string | null;
  /** ISO date/datetime string from the form, or null. */
  occurredAt?: string | null;
  dueAt?: string | null;
  visibleToClient?: boolean;
}

/**
 * Dates cross the Server Action boundary as ISO strings because that is what
 * a date input produces and what serialises cleanly; they are parsed here,
 * once, at the boundary. An unparseable value throws rather than silently
 * becoming `Invalid Date`, which Prisma would reject later with a far less
 * useful message.
 */
function parseDate(value: string | null | undefined, label: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is not a valid date.`);
  }
  return parsed;
}

function toActivityType(raw: string): ActivityType {
  if (!isKnownActivityType(raw)) {
    throw new Error(`Unrecognized activity type: ${raw}`);
  }
  return raw;
}

export async function createActivityAction(input: CreateActivityActionInput): Promise<void> {
  const currentUser = await requireAdmin();

  await createActivity(actorFrom(currentUser), {
    entityType: input.entityType,
    entityId: input.entityId,
    type: toActivityType(input.type),
    subject: input.subject,
    body: input.body ?? null,
    occurredAt: parseDate(input.occurredAt, "Date"),
    dueAt: parseDate(input.dueAt, "Due date"),
    visibleToClient: input.visibleToClient ?? false,
  });

  revalidateActivityViews(input.entityType, input.entityId);
}

export async function updateActivityAction(
  activityId: string,
  entityType: string,
  entityId: string,
  input: { subject?: string; body?: string | null; visibleToClient?: boolean },
): Promise<void> {
  const currentUser = await requireAdmin();
  await updateActivity(actorFrom(currentUser), activityId, input);
  revalidateActivityViews(entityType, entityId);
}

export async function setTaskCompletionAction(
  activityId: string,
  entityType: string,
  entityId: string,
  completed: boolean,
): Promise<void> {
  const currentUser = await requireAdmin();
  await setTaskCompletion(actorFrom(currentUser), activityId, completed);
  revalidateActivityViews(entityType, entityId);
}

export async function deleteActivityAction(
  activityId: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  const currentUser = await requireAdmin();
  await deleteActivity(actorFrom(currentUser), activityId);
  revalidateActivityViews(entityType, entityId);
}
