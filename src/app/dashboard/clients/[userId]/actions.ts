"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { assignPropertyToClient } from "@/lib/data/propertyOwnership";
import { createVisaStep, updateVisaStepStatus, type VisaStepEntry } from "@/lib/data/visa";
import { createLedgerEntry } from "@/lib/data/ledgers";
import {
  attachRentalStageFile,
  getRentalStageAttachmentPath,
  setOfferDetails,
  setRentalStageStatus,
} from "@/lib/data/rentalStages";
import { createSignedDownloadUrl, isStorageConfigured, uploadRentalStageFile } from "@/lib/storage";
import { RENTAL_STAGE_BY_KEY, type RentalStageStatus } from "@/lib/rentalStages";
import { Role } from "@/lib/auth/role";
import type { ActorContext } from "@/lib/data/audit";

/**
 * Every action here re-checks admin role server-side rather than trusting
 * that the controls were merely hidden from a non-admin client — the same
 * reasoning as src/app/dashboard/projects/actions.ts's own requireAdmin().
 *
 * `tenantId` and `actorUserId` always come from the signed-in admin's own
 * resolved session, never from a parameter: that is what stops a crafted
 * request naming a userId in some other tenant from writing across the
 * boundary, and what makes the audit trail's attribution trustworthy, since
 * Prisma bypasses RLS entirely (see ARCHITECTURE.md).
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

function revalidateClientViews(userId: string): void {
  revalidatePath(`/dashboard/clients/${userId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/rental");
}

export async function assignPropertyAction(userId: string, propertyId: string): Promise<void> {
  const currentUser = await requireAdmin();
  await assignPropertyToClient(actorFrom(currentUser), userId, propertyId);
  revalidateClientViews(userId);
}

export async function createVisaStepAction(
  userId: string,
  input: { title: string; description?: string | null },
): Promise<void> {
  const currentUser = await requireAdmin();
  await createVisaStep(actorFrom(currentUser), userId, input);
  revalidateClientViews(userId);
}

export async function updateVisaStepStatusAction(
  userId: string,
  visaStepId: string,
  status: VisaStepEntry["status"],
): Promise<void> {
  const currentUser = await requireAdmin();
  await updateVisaStepStatus(actorFrom(currentUser), visaStepId, status);
  revalidateClientViews(userId);
}

export async function createLedgerEntryAction(
  userId: string,
  propertyId: string,
  amount: number,
  dueDate: string,
): Promise<void> {
  const currentUser = await requireAdmin();
  await createLedgerEntry(actorFrom(currentUser), propertyId, userId, amount, dueDate);
  revalidateClientViews(userId);
}

// ── Rental workflow ────────────────────────────────────────────────────────

export async function setRentalStageStatusAction(
  userId: string,
  stageKey: string,
  status: RentalStageStatus,
): Promise<void> {
  const currentUser = await requireAdmin();
  await setRentalStageStatus(actorFrom(currentUser), userId, stageKey, status);
  revalidateClientViews(userId);
}

export async function setOfferDetailsAction(
  userId: string,
  input: { price?: number | null; durationMonths?: number | null; comments?: string | null },
): Promise<void> {
  const currentUser = await requireAdmin();
  await setOfferDetails(actorFrom(currentUser), userId, input);
  revalidateClientViews(userId);
}

/**
 * Accepts the raw upload as FormData, stores the object, then records where
 * it landed. Validation (declared type vs. the stage's allowed types, and
 * size) happens in src/lib/storage.ts, server-side — a client-side `accept`
 * attribute is a convenience, never a control.
 */
export async function uploadRentalStageFileAction(formData: FormData): Promise<void> {
  const currentUser = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const stageKey = String(formData.get("stageKey") ?? "");
  const file = formData.get("file");

  if (!userId || !stageKey) {
    throw new Error("A user and a stage are required to upload a file.");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("No file was provided.");
  }

  const definition = RENTAL_STAGE_BY_KEY.get(stageKey);
  if (!definition || definition.slot === "none") {
    throw new Error(`Rental stage ${stageKey} does not accept a file attachment.`);
  }

  const stored = await uploadRentalStageFile({
    tenantId: currentUser.tenantId,
    userId,
    stageKey,
    slot: definition.slot,
    file,
  });

  await attachRentalStageFile(actorFrom(currentUser), userId, stageKey, stored);
  revalidateClientViews(userId);
}

/**
 * Returns a short-lived signed URL for a stage's attachment.
 *
 * The bucket is private and the stored path is never sent to the browser, so
 * a download always goes through this admin-gated action rather than a
 * guessable public URL.
 */
export async function getRentalStageFileUrlAction(userId: string, stageKey: string): Promise<string> {
  const currentUser = await requireAdmin();

  if (!isStorageConfigured()) {
    throw new Error("File storage is not configured.");
  }

  const path = await getRentalStageAttachmentPath(currentUser.tenantId, userId, stageKey);
  if (!path) {
    throw new Error("No file is attached to this stage.");
  }

  return createSignedDownloadUrl(path);
}
