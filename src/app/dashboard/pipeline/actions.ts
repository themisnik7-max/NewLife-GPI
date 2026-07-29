"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { Role } from "@/lib/auth/role";
import {
  createContact,
  createDeal,
  deleteDeal,
  moveDeal,
  updateContact,
  updateDeal,
} from "@/lib/data/pipeline";
import { isKnownDealStage, type DealStageKey } from "@/lib/pipeline";
import type { ActorContext } from "@/lib/data/audit";

/**
 * Server Actions for the pipeline.
 *
 * Admin-only throughout, and here that is not merely the convention followed
 * elsewhere in this app — the pipeline has no client-facing surface at all
 * (see the module note in src/lib/data/pipeline.ts). Every function below
 * re-checks the role server-side.
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

function revalidatePipeline(): void {
  revalidatePath("/dashboard/pipeline");
  // The Overview forecast and the open-tasks panel both read pipeline data.
  revalidatePath("/dashboard");
}

/**
 * Dates arrive as ISO strings because that is what a date input produces and
 * what serialises across the action boundary; parsed once, here. An
 * unparseable value throws rather than becoming `Invalid Date`, which Prisma
 * would later reject with a far less useful message.
 */
function parseDate(value: string | null | undefined, label: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is not a valid date.`);
  }
  return parsed;
}

/**
 * Money arrives as a string from a text input. Empty means "no value", which
 * is a real and distinct state from zero — a lead nobody has priced yet is
 * not a lead worth nothing.
 */
function parseMoney(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Deal value must be a number.");
  }
  return parsed;
}

export interface CreateContactActionInput {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  nationality?: string;
  source?: string;
  notes?: string;
}

export async function createContactAction(input: CreateContactActionInput): Promise<void> {
  const currentUser = await requireAdmin();
  await createContact(actorFrom(currentUser), input);
  revalidatePipeline();
}

export async function updateContactAction(
  contactId: string,
  input: CreateContactActionInput,
): Promise<void> {
  const currentUser = await requireAdmin();
  await updateContact(actorFrom(currentUser), contactId, input);
  revalidatePipeline();
}

export interface CreateDealActionInput {
  contactId: string;
  title: string;
  stage?: string;
  value?: string | null;
  propertyId?: string | null;
  expectedCloseDate?: string | null;
}

export async function createDealAction(input: CreateDealActionInput): Promise<void> {
  const currentUser = await requireAdmin();

  const stage = input.stage ?? "NEW_LEAD";
  if (!isKnownDealStage(stage)) {
    throw new Error(`Unrecognized deal stage: ${stage}`);
  }

  await createDeal(actorFrom(currentUser), {
    contactId: input.contactId,
    title: input.title,
    stage,
    value: parseMoney(input.value),
    propertyId: input.propertyId || null,
    expectedCloseDate: parseDate(input.expectedCloseDate, "Expected close date"),
  });

  revalidatePipeline();
}

/**
 * The drag-and-drop write.
 *
 * `position` is computed on the client by positionForIndex() and passed
 * through, rather than being derived here from an index. The client is the
 * only side that knows what the column looked like when the card was
 * dropped — recomputing server-side from an index would race with a
 * concurrent drag by another admin and land the card somewhere neither of
 * them chose.
 */
export async function moveDealAction(
  dealId: string,
  stage: string,
  position: number,
): Promise<void> {
  const currentUser = await requireAdmin();

  if (!isKnownDealStage(stage)) {
    throw new Error(`Unrecognized deal stage: ${stage}`);
  }

  await moveDeal(actorFrom(currentUser), dealId, stage as DealStageKey, position);
  revalidatePipeline();
}

export async function updateDealAction(
  dealId: string,
  input: {
    title?: string;
    value?: string | null;
    propertyId?: string | null;
    expectedCloseDate?: string | null;
    lostReason?: string | null;
  },
): Promise<void> {
  const currentUser = await requireAdmin();

  await updateDeal(actorFrom(currentUser), dealId, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.value !== undefined ? { value: parseMoney(input.value) } : {}),
    ...(input.propertyId !== undefined ? { propertyId: input.propertyId || null } : {}),
    ...(input.expectedCloseDate !== undefined
      ? { expectedCloseDate: parseDate(input.expectedCloseDate, "Expected close date") }
      : {}),
    ...(input.lostReason !== undefined ? { lostReason: input.lostReason } : {}),
  });

  revalidatePipeline();
}

export async function deleteDealAction(dealId: string): Promise<void> {
  const currentUser = await requireAdmin();
  await deleteDeal(actorFrom(currentUser), dealId);
  revalidatePipeline();
}
