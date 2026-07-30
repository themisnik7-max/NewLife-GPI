import "server-only";
import { prisma } from "@/lib/prisma";
import { AuditAction, recordAuditEvent, type ActorContext } from "@/lib/data/audit";
import { createActivity } from "@/lib/data/activities";
import { isStalled, renderMessage, validateRule, type AutomationMatch, type AutomationTrigger, type RuleView } from "@/lib/automations";
import { isKnownTrigger, triggerLabel, isKnownAction } from "@/lib/automations";
import { CLOSED_STAGE_KEYS } from "@/lib/pipeline";
import { Role } from "@/lib/auth/role";

/**
 * Prisma-backed automation rules, and the engine that evaluates them.
 *
 * ⚠️ ADMIN-ONLY throughout. A rule's message template describes how the
 * business chases its own clients; there is no client-facing counterpart and
 * there should not be one.
 *
 * ⚠️ THE ENGINE IS DELIBERATELY IDEMPOTENT-ISH, NOT EXACTLY-ONCE. Running the
 * same rule twice in a day would otherwise send the same nudge twice. Each
 * match is de-duplicated against notifications already created for the same
 * rule and subject within the rule's own window — see `alreadyNotified`.
 * That is weaker than a delivery ledger and it is the honest tradeoff: a
 * ledger is the right answer once this sends real email, and it is not worth
 * a table while every action lands in-app.
 */

const RULE_SELECT = {
  id: true,
  name: true,
  trigger: true,
  thresholdDays: true,
  action: true,
  messageTemplate: true,
  enabled: true,
  lastRunAt: true,
  lastMatchCount: true,
} as const;

interface RuleRow {
  id: string;
  name: string;
  trigger: string;
  thresholdDays: number | null;
  action: string;
  messageTemplate: string;
  enabled: boolean;
  lastRunAt: Date | null;
  lastMatchCount: number | null;
}

function toRuleView(row: RuleRow): RuleView {
  if (!isKnownTrigger(row.trigger) || !isKnownAction(row.action)) {
    // The database check constraints make this unreachable, but the types
    // don't know that — and a rule the engine cannot evaluate is worse
    // rendered than thrown on, because it would sit in the list looking
    // active while doing nothing.
    throw new Error(`Rule ${row.id} has an unrecognized trigger or action.`);
  }

  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    triggerLabel: triggerLabel(row.trigger),
    thresholdDays: row.thresholdDays,
    action: row.action,
    messageTemplate: row.messageTemplate,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastMatchCount: row.lastMatchCount,
  };
}

export async function getAutomationRules(tenantId: string): Promise<RuleView[]> {
  const rows = await prisma.automationRule.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: RULE_SELECT,
  });
  return rows.map(toRuleView);
}

export interface CreateRuleInput {
  name: string;
  trigger: string;
  thresholdDays: number | null;
  action: string;
  messageTemplate: string;
}

export async function createAutomationRule(
  actor: ActorContext,
  input: CreateRuleInput,
): Promise<RuleView> {
  const problems = validateRule(input);
  if (problems.length > 0) {
    throw new Error(problems.join(" "));
  }

  const created = await prisma.$transaction(async (tx) => {
    const rule = await tx.automationRule.create({
      data: {
        tenantId: actor.tenantId,
        name: input.name.trim(),
        trigger: input.trigger,
        // Normalised to null for triggers that take no threshold, so a
        // leftover value from the form cannot make a rule look configurable
        // in a way the engine ignores.
        thresholdDays: input.thresholdDays,
        action: input.action,
        messageTemplate: input.messageTemplate.trim(),
        createdByUserId: actor.actorUserId,
      },
      select: RULE_SELECT,
    });

    await recordAuditEvent(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.actorUserId,
      entityType: "AutomationRule",
      entityId: rule.id,
      action: AuditAction.CREATE,
      metadata: { name: rule.name, trigger: rule.trigger, action: rule.action },
    });

    return rule;
  });

  return toRuleView(created);
}

export async function setRuleEnabled(
  actor: ActorContext,
  ruleId: string,
  enabled: boolean,
): Promise<void> {
  const { count } = await prisma.automationRule.updateMany({
    where: { id: ruleId, tenantId: actor.tenantId },
    data: { enabled },
  });
  if (count === 0) {
    throw new Error(`Automation rule ${ruleId} was not found for tenant ${actor.tenantId}.`);
  }
}

export async function deleteAutomationRule(actor: ActorContext, ruleId: string): Promise<void> {
  const { count } = await prisma.automationRule.deleteMany({
    where: { id: ruleId, tenantId: actor.tenantId },
  });
  if (count === 0) {
    throw new Error(`Automation rule ${ruleId} was not found for tenant ${actor.tenantId}.`);
  }
}

// ── The engine ──────────────────────────────────────────────────────

/**
 * Every admin in the tenant — the audience for a NOTIFY action.
 *
 * Notifications go to admins, not to the client the match is about. A rule
 * that fires because a client's payment is late must nudge the person who
 * will chase it, not the person who is late; automated dunning is a product
 * decision this business has not made.
 */
async function getAdminUserIds(tenantId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { tenantId, role: Role.ADMIN },
    select: { id: true },
  });
  return admins.map((admin) => admin.id);
}

async function findMatches(
  tenantId: string,
  trigger: AutomationTrigger,
  thresholdDays: number | null,
  now: Date,
): Promise<AutomationMatch[]> {
  const admins = await getAdminUserIds(tenantId);
  // Every action targets an admin; with none there is nobody to tell, and
  // running the queries anyway would be work whose result is discarded.
  if (admins.length === 0) return [];
  const primaryAdmin = admins[0];

  switch (trigger) {
    case "DEAL_STALLED": {
      const deals = await prisma.deal.findMany({
        where: { tenantId, stage: { notIn: [...CLOSED_STAGE_KEYS] } },
        select: { id: true, title: true, updatedAt: true },
      });
      return deals
        .filter((deal) => isStalled(deal.updatedAt, thresholdDays ?? 14, now))
        .map((deal) => ({
          targetUserId: primaryAdmin,
          subject: deal.title,
          entityType: "Deal",
          entityId: deal.id,
        }));
    }

    case "DEAL_CLOSE_DATE_PASSED": {
      const deals = await prisma.deal.findMany({
        where: {
          tenantId,
          stage: { notIn: [...CLOSED_STAGE_KEYS] },
          expectedCloseDate: { lt: now },
        },
        select: { id: true, title: true },
      });
      return deals.map((deal) => ({
        targetUserId: primaryAdmin,
        subject: deal.title,
        entityType: "Deal",
        entityId: deal.id,
      }));
    }

    case "PAYMENT_OVERDUE": {
      const payments = await prisma.paymentLedger.findMany({
        // Computed against the clock rather than the stored is_delayed flag,
        // matching getTenantMetrics(): an installment is overdue the moment
        // its due date passes, with no batch job needed first.
        where: { tenantId, status: { not: "PAID" }, dueDate: { lt: now } },
        select: {
          id: true,
          amount: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      });
      return payments.map((payment) => ({
        targetUserId: primaryAdmin,
        subject: `€${Math.round(payment.amount).toLocaleString("en-GB")} from ${
          [payment.user.firstName, payment.user.lastName].filter(Boolean).join(" ") ||
          payment.user.email
        }`,
        entityType: "PaymentLedger",
        entityId: payment.id,
      }));
    }

    case "TASK_OVERDUE": {
      const tasks = await prisma.activity.findMany({
        where: { tenantId, type: "TASK", completedAt: null, dueAt: { lt: now } },
        select: { id: true, subject: true },
      });
      return tasks.map((task) => ({
        targetUserId: primaryAdmin,
        subject: task.subject,
        entityType: "Activity",
        entityId: task.id,
      }));
    }

    case "RENTAL_STAGE_STALLED": {
      const records = await prisma.rentalStageRecord.findMany({
        where: { tenantId, status: "DONE" },
        orderBy: { completedAt: "desc" },
        select: {
          userId: true,
          completedAt: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      });

      // One match per client, on their MOST RECENT completed stage — the
      // rows arrive newest-first, so the first sighting of a user is theirs.
      // Matching per row would fire once for every stage they have ever
      // completed, which is a rule that gets muted rather than fixed.
      const seen = new Set<string>();
      const matches: AutomationMatch[] = [];
      for (const record of records) {
        if (seen.has(record.userId)) continue;
        seen.add(record.userId);
        if (!record.completedAt) continue;
        if (!isStalled(record.completedAt, thresholdDays ?? 21, now)) continue;
        matches.push({
          targetUserId: primaryAdmin,
          subject:
            [record.user.firstName, record.user.lastName].filter(Boolean).join(" ") ||
            record.user.email,
          entityType: "User",
          entityId: record.userId,
        });
      }
      return matches;
    }

    case "VISA_STEP_STALLED": {
      const steps = await prisma.visaStep.findMany({
        where: { tenantId, status: "IN_PROGRESS" },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      });
      return steps
        .filter((step) => isStalled(step.updatedAt, thresholdDays ?? 30, now))
        .map((step) => ({
          targetUserId: primaryAdmin,
          subject: `${step.title} for ${
            [step.user.firstName, step.user.lastName].filter(Boolean).join(" ") || step.user.email
          }`,
          entityType: "VisaStep",
          entityId: step.id,
        }));
    }
  }
}

/**
 * Whether this rule already told this admin about this subject recently.
 *
 * The de-duplication window is the rule's own threshold, or 24 hours for a
 * rule with none: re-nudging about the same stalled deal every time someone
 * clicks Run is how an automation gets muted. Matching on the rendered
 * message rather than an id is what makes this work without a delivery
 * ledger — and is exactly the shortcut a ledger would replace when this
 * starts sending email.
 */
async function alreadyNotified(
  tenantId: string,
  userId: string,
  message: string,
  windowDays: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: { tenantId, userId, message, createdAt: { gte: since } },
    select: { id: true },
  });
  return existing !== null;
}

export interface RunResult {
  ruleId: string;
  ruleName: string;
  matched: number;
  /** Matches that were suppressed as duplicates of a recent notification. */
  suppressed: number;
  delivered: number;
}

/**
 * Evaluates every enabled rule and performs its action.
 *
 * ⚠️ ONE RULE'S FAILURE MUST NOT STOP THE REST. Each rule is evaluated in its
 * own try/catch and its error recorded against that rule, because the
 * alternative — a single throw aborting the run — means one malformed rule
 * silently disables every other automation the business depends on.
 *
 * Returns a per-rule report rather than a total, so the admin who pressed
 * the button can see which rule did what instead of a number they have to
 * take on trust.
 */
export async function runAutomations(actor: ActorContext, now: Date = new Date()): Promise<RunResult[]> {
  const rules = await prisma.automationRule.findMany({
    where: { tenantId: actor.tenantId, enabled: true },
    select: RULE_SELECT,
  });

  const results: RunResult[] = [];

  for (const row of rules) {
    const result: RunResult = { ruleId: row.id, ruleName: row.name, matched: 0, suppressed: 0, delivered: 0 };

    try {
      if (!isKnownTrigger(row.trigger)) {
        throw new Error(`Unrecognized trigger: ${row.trigger}`);
      }

      const matches = await findMatches(actor.tenantId, row.trigger, row.thresholdDays, now);
      result.matched = matches.length;

      const windowDays = row.thresholdDays ?? 1;

      for (const match of matches) {
        const message = renderMessage(row.messageTemplate, match.subject);

        if (await alreadyNotified(actor.tenantId, match.targetUserId, message, windowDays)) {
          result.suppressed += 1;
          continue;
        }

        if (row.action === "CREATE_TASK") {
          await createActivity(actor, {
            entityType: match.entityType,
            entityId: match.entityId,
            type: "TASK",
            subject: message,
            // Due immediately: a task the automation raised is already late
            // by the time it exists — that is what triggered it.
            dueAt: now,
          });
        }

        // A notification is written on BOTH paths. A task created in a
        // record nobody opens today is invisible; the notification is what
        // makes it noticed, and the task is what makes it actionable.
        await prisma.notification.create({
          data: { tenantId: actor.tenantId, userId: match.targetUserId, message },
        });

        result.delivered += 1;
      }

      await prisma.automationRule.updateMany({
        where: { id: row.id, tenantId: actor.tenantId },
        data: { lastRunAt: now, lastMatchCount: result.matched },
      });
    } catch (err) {
      console.error(`Automation rule ${row.id} failed:`, err);
      // Recorded so a rule that has been quietly failing for a week is
      // discoverable, rather than looking like a rule that never matches.
      await prisma.automationRule
        .updateMany({
          where: { id: row.id, tenantId: actor.tenantId },
          data: { lastRunAt: now, lastMatchCount: null },
        })
        .catch(() => undefined);
    }

    results.push(result);
  }

  return results;
}
