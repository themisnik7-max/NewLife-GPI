"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { Role } from "@/lib/auth/role";
import {
  createAutomationRule,
  deleteAutomationRule,
  runAutomations,
  setRuleEnabled,
  type RunResult,
} from "@/lib/data/automations";
import type { ActorContext } from "@/lib/data/audit";

/**
 * Server Actions for the automation engine. Admin-only throughout.
 *
 * `runAutomationsAction` is the manual trigger. The same engine is reachable
 * from a scheduled route handler (src/app/api/automations/run/route.ts) so a
 * cron can drive it — but the button exists because an automation you cannot
 * run on demand is one you cannot test, and a rule nobody has watched fire is
 * a rule nobody trusts.
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

export interface CreateRuleActionInput {
  name: string;
  trigger: string;
  /** From a number input, so it arrives as a string or empty. */
  thresholdDays: string;
  action: string;
  messageTemplate: string;
}

export async function createRuleAction(input: CreateRuleActionInput): Promise<void> {
  const currentUser = await requireAdmin();

  const trimmed = input.thresholdDays.trim();
  const thresholdDays = trimmed === "" ? null : Number(trimmed);
  if (thresholdDays !== null && !Number.isFinite(thresholdDays)) {
    throw new Error("Days must be a number.");
  }

  await createAutomationRule(actorFrom(currentUser), {
    name: input.name,
    trigger: input.trigger,
    thresholdDays,
    action: input.action,
    messageTemplate: input.messageTemplate,
  });

  revalidatePath("/dashboard/automations");
}

export async function setRuleEnabledAction(ruleId: string, enabled: boolean): Promise<void> {
  const currentUser = await requireAdmin();
  await setRuleEnabled(actorFrom(currentUser), ruleId, enabled);
  revalidatePath("/dashboard/automations");
}

export async function deleteRuleAction(ruleId: string): Promise<void> {
  const currentUser = await requireAdmin();
  await deleteAutomationRule(actorFrom(currentUser), ruleId);
  revalidatePath("/dashboard/automations");
}

export async function runAutomationsAction(): Promise<RunResult[]> {
  const currentUser = await requireAdmin();
  const results = await runAutomations(actorFrom(currentUser));

  revalidatePath("/dashboard/automations");
  // Notifications land in the bell on every page, and a rule may have
  // created tasks the Overview panel shows.
  revalidatePath("/dashboard");

  return results;
}
