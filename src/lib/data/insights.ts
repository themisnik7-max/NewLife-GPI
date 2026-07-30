import "server-only";
import { prisma } from "@/lib/prisma";
import { runAiRequest } from "@/lib/ai/client";
import {
  detectPaymentSignals,
  detectPipelineHealthSignals,
  detectStalledDeals,
  detectTaskSignals,
  signalsToPromptContext,
  sortSignals,
  type Signal,
} from "@/lib/ai/signals";
import { FIRST_STAGE, calculateForecast, dealStageLabel, isKnownDealStage } from "@/lib/pipeline";
import { getTenantMetrics } from "@/lib/data/metrics";
import { getOpenTasks } from "@/lib/data/activities";
import { isOverdueTask } from "@/lib/activities";
import { Role } from "@/lib/auth/role";

/**
 * The two AI features: Pipeline Monitor (tenant-wide) and Client Brief
 * (one client).
 *
 * ⚠️ THE TWO-FUNCTION RULE IS LOAD-BEARING HERE IN A NEW WAY. Everywhere else
 * in this codebase it prevents one user's data reaching another's screen.
 * Here it prevents one user's data reaching another's screen *via a language
 * model*, which is worse in two ways: the leak is laundered through prose, so
 * it is not obvious on inspection, and the data has left the building —
 * whatever is put in a prompt has been sent to a third party and cannot be
 * recalled.
 *
 * Both builders below are therefore ADMIN-ONLY, take an explicit subject id,
 * and are never handed "everything in the tenant" as a convenience. There is
 * deliberately no client-facing AI feature at all: a client asking an LLM
 * about their own file is a product this business has not decided to build,
 * and it would need its own context builder rather than a flag on these.
 *
 * Callers perform the role check, like every other admin-only reader.
 */

const BRIEF_SYSTEM_PROMPT = [
  "You are an assistant to a Greek Golden Visa property consultancy.",
  "You write short, factual internal briefings for the consultant, never for the client.",
  "",
  "Rules you must follow:",
  "- Use ONLY the facts given to you. Every figure, date and name must appear in the input.",
  "- Never estimate, extrapolate, or infer a number that was not supplied.",
  "- If something is not in the input, say it is not recorded rather than guessing.",
  "- Write 3-5 sentences of plain prose. No headings, no bullet points, no preamble.",
  "- Lead with what needs attention. If nothing does, say so plainly in one sentence.",
].join("\n");

const MONITOR_SYSTEM_PROMPT = [
  "You are an assistant to a Greek Golden Visa property consultancy.",
  "You are given a numbered list of issues that have ALREADY been detected by the system.",
  "",
  "Rules you must follow:",
  "- Summarise and prioritise the issues you were given. Do not invent new ones.",
  "- Never state a number that does not appear in the input.",
  "- Write 2-4 sentences of plain prose. No headings, no bullet points, no preamble.",
  "- Say which issue to deal with first and why.",
  "- If the input says no issues were detected, say the pipeline looks healthy in one sentence.",
].join("\n");

export interface Insight {
  /** The deterministic findings — always present, key or no key. */
  signals: Signal[];
  /** The model's write-up, or null when AI is unavailable or failed. */
  narrative: string | null;
  /** Why there is no narrative, for display. Null when there is one. */
  narrativeUnavailableReason: string | null;
  costUsd: number | null;
}

/**
 * Resolves which credential to use for this tenant.
 *
 * Picks the tenant's most recently created ACTIVE key. Deliberately not a
 * parameter: letting a caller name a key id would mean every call site has
 * to be trusted to pass one belonging to the right tenant, and
 * getDecryptedApiKey's tenant check would be the only thing standing between
 * a mistake and a cross-tenant charge.
 */
async function resolveTenantApiKeyId(tenantId: string): Promise<string | null> {
  const key = await prisma.encryptedApiKey.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return key?.id ?? null;
}

/**
 * Runs the model over an already-computed context, and degrades rather than
 * throws.
 *
 * A missing key or a provider outage must not take down a panel whose
 * deterministic half is perfectly good — the signals are the substance, the
 * prose is the polish. The reason is returned for display so "no summary"
 * never looks like "nothing to report".
 */
async function narrate(
  tenantId: string,
  agentAction: string,
  system: string,
  prompt: string,
  metadata: Record<string, unknown>,
): Promise<{ narrative: string | null; reason: string | null; costUsd: number | null }> {
  const apiKeyId = await resolveTenantApiKeyId(tenantId);
  if (!apiKeyId) {
    return {
      narrative: null,
      reason: "No AI key is configured for this workspace. Add one in Settings.",
      costUsd: null,
    };
  }

  try {
    const result = await runAiRequest({
      tenantId,
      apiKeyId,
      agentAction,
      system,
      prompt,
      metadata,
    });
    return { narrative: result.text, reason: null, costUsd: result.costUsd };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The AI request failed.";
    // Already recorded in AiLog by runAiRequest; logged here too so it shows
    // up in server logs next to the request that triggered it.
    console.error(`AI narration failed for tenant ${tenantId} (${agentAction}):`, err);
    return { narrative: null, reason: message, costUsd: null };
  }
}

/**
 * Pipeline Monitor — the state of the business, tenant-wide.
 *
 * ADMIN ONLY. Every input is an aggregate (counts, sums, deal titles), never
 * a client's personal details: the model is asked "what should the business
 * attend to", and nothing in that question requires a passport number or a
 * private note. Keeping the prompt to aggregates is what makes this feature
 * safe to run over the whole tenant at once.
 */
export async function getPipelineMonitor(tenantId: string): Promise<Insight> {
  const [dealRows, metrics, openTasks] = await Promise.all([
    prisma.deal.findMany({
      where: { tenantId },
      select: {
        id: true,
        title: true,
        stage: true,
        value: true,
        expectedCloseDate: true,
        updatedAt: true,
        contact: { select: { firstName: true, lastName: true } },
      },
    }),
    getTenantMetrics(tenantId),
    getOpenTasks(tenantId, 200),
  ]);

  const deals = dealRows.map((row) => ({
    id: row.id,
    title: row.title,
    // Tolerated rather than thrown on: an unknown stage should degrade this
    // panel to "I can't label that one", not break the admin's dashboard.
    stage: isKnownDealStage(row.stage) ? row.stage : FIRST_STAGE,
    stageLabel: dealStageLabel(row.stage),
    value: row.value === null ? null : Number(row.value),
    expectedCloseDate: row.expectedCloseDate
      ? row.expectedCloseDate.toISOString().slice(0, 10)
      : null,
    updatedAt: row.updatedAt.toISOString(),
    contactName: [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ").trim(),
  }));

  const forecast = calculateForecast(
    deals.map((deal) => ({ ...deal, stage: deal.stage as never })) as never,
  );

  const signals = sortSignals([
    ...detectStalledDeals(deals),
    ...detectPipelineHealthSignals({
      openCount: forecast.openCount,
      missingValueCount: forecast.missingValueCount,
      openValue: forecast.openValue,
    }),
    ...detectPaymentSignals({
      overdueCount: metrics.payments.overdueCount,
      outstanding: metrics.payments.outstanding,
    }),
    ...detectTaskSignals({
      overdueTaskCount: openTasks.filter((task) => isOverdueTask(task)).length,
    }),
  ]);

  const { narrative, reason, costUsd } = await narrate(
    tenantId,
    "pipeline_monitor",
    MONITOR_SYSTEM_PROMPT,
    signalsToPromptContext(signals),
    { signalCount: signals.length },
  );

  return { signals, narrative, narrativeUnavailableReason: reason, costUsd };
}

/**
 * Client Brief — where one client stands, across every workflow.
 *
 * ADMIN ONLY, and it takes a subject id that is NOT the caller's. The
 * counterpart a client would need does not exist; see the module note.
 *
 * What is deliberately NOT sent to the model: `users.admin_notes`, passport
 * number, date of birth, and phone. The brief answers "where does this
 * client stand" — progress counts, money, dates — and none of those
 * questions need identifying documents. Sending them would put a passport
 * number in a third party's logs to produce a sentence that never mentions
 * it.
 */
export async function getClientBrief(tenantId: string, userId: string): Promise<Insight> {
  const client = await prisma.user.findFirst({
    where: { id: userId, tenantId, role: Role.TENANT },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      nationality: true,
      createdAt: true,
    },
  });
  if (!client) {
    throw new Error(`Client ${userId} was not found for tenant ${tenantId}.`);
  }

  const [ownership, ledger, visaSteps, rentalStages, recentActivity] = await Promise.all([
    prisma.propertyOwnership.findFirst({
      where: { tenantId, userId },
      select: {
        saleDate: true,
        salePrice: true,
        property: { select: { name: true, area: true, deliveryDate: true, status: true } },
      },
    }),
    prisma.paymentLedger.findMany({
      where: { tenantId, userId },
      select: { amount: true, amountPaid: true, dueDate: true, status: true },
    }),
    prisma.visaStep.findMany({
      where: { tenantId, userId },
      select: { title: true, status: true },
      orderBy: { stepOrder: "asc" },
    }),
    prisma.rentalStageRecord.findMany({
      where: { tenantId, userId },
      select: { stageKey: true, status: true },
    }),
    prisma.activity.findMany({
      where: { tenantId, entityType: "User", entityId: userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      // `body` is excluded on purpose — an internal note's full text is the
      // most sensitive free text this app holds, and the subject line is
      // enough to say what has been happening.
      select: { type: true, subject: true, occurredAt: true, createdAt: true },
    }),
  ]);

  const now = new Date();
  const billed = ledger.reduce((sum, row) => sum + row.amount, 0);
  const collected = ledger.reduce((sum, row) => sum + row.amountPaid, 0);
  const overdue = ledger.filter((row) => row.status !== "PAID" && row.dueDate < now).length;

  const lines: string[] = [
    `Client: ${[client.firstName, client.lastName].filter(Boolean).join(" ") || client.email}`,
    client.nationality ? `Nationality: ${client.nationality}` : "Nationality: not recorded",
    `On file since: ${client.createdAt.toISOString().slice(0, 10)}`,
    ownership?.property
      ? `Property: ${ownership.property.name} in ${ownership.property.area}, status ${ownership.property.status}, delivery ${ownership.property.deliveryDate.toISOString().slice(0, 10)}`
      : "Property: none assigned",
    ownership?.salePrice
      ? `Sale price: EUR ${Number(ownership.salePrice).toLocaleString("en-GB")}${ownership.saleDate ? ` on ${ownership.saleDate.toISOString().slice(0, 10)}` : ""}`
      : "Sale price: not recorded",
    `Payments: EUR ${Math.round(collected).toLocaleString("en-GB")} collected of EUR ${Math.round(billed).toLocaleString("en-GB")} billed across ${ledger.length} installments; ${overdue} overdue`,
    visaSteps.length === 0
      ? "Golden Visa: not started"
      : `Golden Visa: ${visaSteps.filter((s) => s.status === "COMPLETED").length} of ${visaSteps.length} steps complete`,
    rentalStages.length === 0
      ? "Rental workflow: not started"
      : `Rental workflow: ${rentalStages.filter((s) => s.status === "DONE").length} of 10 stages complete`,
    recentActivity.length === 0
      ? "Recent contact: nothing logged"
      : `Recent contact: ${recentActivity
          .map(
            (a) =>
              `${a.type.toLowerCase()} "${a.subject}" on ${(a.occurredAt ?? a.createdAt).toISOString().slice(0, 10)}`,
          )
          .join("; ")}`,
  ];

  const signals = sortSignals([
    ...detectPaymentSignals({ overdueCount: overdue, outstanding: Math.max(billed - collected, 0) }),
  ]);

  const { narrative, reason, costUsd } = await narrate(
    tenantId,
    "client_brief",
    BRIEF_SYSTEM_PROMPT,
    lines.join("\n"),
    // The subject is recorded as an id, not a name: AiLog.metadata is a
    // long-lived operational table and does not need a person's name in it
    // to be useful for attribution.
    { subjectUserId: userId },
  );

  return { signals, narrative, narrativeUnavailableReason: reason, costUsd };
}
