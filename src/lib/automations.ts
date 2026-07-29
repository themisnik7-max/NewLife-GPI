// Client/test-safe: the automation vocabulary and the pure functions that
// decide what a rule matches. No database access — the Prisma layer and the
// runner live in src/lib/data/automations.ts (`server-only`).
//
// The split matters more here than elsewhere: "did this rule match, and what
// message does it produce" is the entire behaviour of the feature, and
// keeping it as pure functions means it can be exhaustively tested without a
// database, a clock, or a notification table.

export type AutomationTrigger =
  | "DEAL_STALLED"
  | "DEAL_CLOSE_DATE_PASSED"
  | "PAYMENT_OVERDUE"
  | "TASK_OVERDUE"
  | "RENTAL_STAGE_STALLED"
  | "VISA_STEP_STALLED";

export type AutomationAction = "NOTIFY" | "CREATE_TASK";

export interface TriggerDefinition {
  key: AutomationTrigger;
  label: string;
  description: string;
  /** Whether the trigger takes a "for N days" threshold. */
  usesThreshold: boolean;
  defaultThresholdDays?: number;
}

/**
 * The triggers the engine knows how to evaluate.
 *
 * Mirrored by a database check constraint (0014), unlike the document
 * category list: the engine must have code for each one, so an unrecognised
 * trigger is a bug rather than new business vocabulary. Adding one is
 * therefore a migration AND a code change, deliberately.
 */
export const AUTOMATION_TRIGGERS: ReadonlyArray<TriggerDefinition> = [
  {
    key: "DEAL_STALLED",
    label: "A deal stops moving",
    description: "An open deal has not been touched for the given number of days.",
    usesThreshold: true,
    defaultThresholdDays: 14,
  },
  {
    key: "DEAL_CLOSE_DATE_PASSED",
    label: "A deal misses its close date",
    description: "An open deal's expected close date has passed.",
    usesThreshold: false,
  },
  {
    key: "PAYMENT_OVERDUE",
    label: "A payment goes overdue",
    description: "An installment's due date has passed and it is not fully paid.",
    usesThreshold: false,
  },
  {
    key: "TASK_OVERDUE",
    label: "A task goes overdue",
    description: "An open task's due date has passed.",
    usesThreshold: false,
  },
  {
    key: "RENTAL_STAGE_STALLED",
    label: "A rental workflow stalls",
    description: "A client's last completed letting stage was longer ago than the given days.",
    usesThreshold: true,
    defaultThresholdDays: 21,
  },
  {
    key: "VISA_STEP_STALLED",
    label: "A visa application stalls",
    description: "A client has a visa step in progress and nothing has moved for the given days.",
    usesThreshold: true,
    defaultThresholdDays: 30,
  },
];

export const TRIGGER_BY_KEY: ReadonlyMap<string, TriggerDefinition> = new Map(
  AUTOMATION_TRIGGERS.map((trigger) => [trigger.key, trigger]),
);

export function isKnownTrigger(key: string): key is AutomationTrigger {
  return TRIGGER_BY_KEY.has(key);
}

export const AUTOMATION_ACTIONS: ReadonlyArray<{ key: AutomationAction; label: string }> = [
  { key: "NOTIFY", label: "Send a notification" },
  { key: "CREATE_TASK", label: "Create a task" },
];

export function isKnownAction(key: string): key is AutomationAction {
  return AUTOMATION_ACTIONS.some((action) => action.key === key);
}

/** The placeholder a message template may contain. */
export const SUBJECT_PLACEHOLDER = "{{subject}}";

/**
 * Fills a rule's message template.
 *
 * Deliberately supports exactly one placeholder rather than a general
 * templating language. A rule author is an admin typing into a text box, not
 * a programmer — one substitution they can remember beats an expression
 * syntax they have to look up, and it cannot be made to read a field the
 * rule was never given.
 *
 * A template with no placeholder is used verbatim rather than having the
 * subject appended: someone who wrote a message without it meant it.
 */
export function renderMessage(template: string, subject: string): string {
  return template.split(SUBJECT_PLACEHOLDER).join(subject);
}

/** One thing a rule matched, before it becomes a notification or a task. */
export interface AutomationMatch {
  /** Who should be told. Clerk user id. */
  targetUserId: string;
  /** The record's display name, substituted into the template. */
  subject: string;
  /** Where the match came from, for the audit metadata. */
  entityType: string;
  entityId: string;
}

export interface RuleView {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  triggerLabel: string;
  thresholdDays: number | null;
  action: AutomationAction;
  messageTemplate: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastMatchCount: number | null;
}

export function triggerLabel(key: string): string {
  return TRIGGER_BY_KEY.get(key)?.label ?? key;
}

/**
 * Validates a rule before it is stored.
 *
 * Returns the problems rather than throwing on the first one, so the form can
 * show everything wrong at once instead of making the author fix issues one
 * submit at a time.
 */
export function validateRule(input: {
  name: string;
  trigger: string;
  thresholdDays: number | null;
  action: string;
  messageTemplate: string;
}): string[] {
  const problems: string[] = [];

  if (!input.name.trim()) problems.push("Give the rule a name.");
  if (!isKnownTrigger(input.trigger)) problems.push(`Unrecognized trigger: ${input.trigger}`);
  if (!isKnownAction(input.action)) problems.push(`Unrecognized action: ${input.action}`);
  if (!input.messageTemplate.trim()) problems.push("Write a message for the rule to send.");

  const definition = TRIGGER_BY_KEY.get(input.trigger);
  if (definition?.usesThreshold) {
    if (input.thresholdDays === null || !Number.isInteger(input.thresholdDays) || input.thresholdDays <= 0) {
      problems.push("This trigger needs a positive whole number of days.");
    }
  }

  return problems;
}

/**
 * Whether a record counts as stalled.
 *
 * Extracted as its own function because three triggers share it and a
 * threshold comparison written three times is a threshold comparison with
 * three chances to use `>` where it meant `>=`.
 */
export function isStalled(lastTouched: Date | string, thresholdDays: number, now: Date): boolean {
  const last = typeof lastTouched === "string" ? new Date(lastTouched) : lastTouched;
  const elapsedDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  return elapsedDays >= thresholdDays;
}
