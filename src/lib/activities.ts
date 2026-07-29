// Client/test-safe: the activity vocabulary and the pure functions that turn
// stored rows into readable timeline entries. No database access happens
// here, so this stays importable from Client Components — the Prisma-backed
// layer lives in src/lib/data/activities.ts, which is `server-only`.
//
// Same split as src/lib/rentalStages.ts ↔ src/lib/data/rentalStages.ts and
// src/lib/documents.ts ↔ src/lib/data/documents.ts.

export type ActivityType = "CALL" | "EMAIL" | "MEETING" | "NOTE" | "TASK";

export interface ActivityTypeDefinition {
  key: ActivityType;
  label: string;
  /** Verb used in the timeline, e.g. "Called" / "Emailed". */
  pastTense: string;
  /** TASK is the only type with a due date instead of an occurrence time. */
  isTask?: boolean;
}

/**
 * The five interaction types. Unlike the document category list this one is
 * genuinely closed — a thing either happened by phone or it did not — which
 * is why the database column carries a check constraint against exactly
 * these values (see 0011_activities.sql). Adding a sixth type therefore DOES
 * require a migration, deliberately.
 */
export const ACTIVITY_TYPES: ReadonlyArray<ActivityTypeDefinition> = [
  { key: "CALL", label: "Call", pastTense: "Called" },
  { key: "EMAIL", label: "Email", pastTense: "Emailed" },
  { key: "MEETING", label: "Meeting", pastTense: "Met with" },
  { key: "NOTE", label: "Note", pastTense: "Noted" },
  { key: "TASK", label: "Task", pastTense: "Task", isTask: true },
];

export const ACTIVITY_TYPE_BY_KEY: ReadonlyMap<string, ActivityTypeDefinition> = new Map(
  ACTIVITY_TYPES.map((type) => [type.key, type]),
);

export function isKnownActivityType(key: string): key is ActivityType {
  return ACTIVITY_TYPE_BY_KEY.has(key);
}

export function activityLabelFor(key: string): string {
  return ACTIVITY_TYPE_BY_KEY.get(key)?.label ?? key;
}

/** One person-authored entry. */
export interface ActivityView {
  id: string;
  entityType: string;
  entityId: string;
  type: ActivityType;
  typeLabel: string;
  subject: string;
  body: string | null;
  /** When it happened (non-task) — ISO, or null for a task. */
  occurredAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  visibleToClient: boolean;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

/**
 * One entry in the merged feed.
 *
 * A discriminated union rather than a flattened shape with nullable fields
 * from both sources: the two kinds render differently (an activity is
 * editable and has a body; a system event is neither) and the renderer must
 * not be able to confuse them. `kind` is what makes that a compile-time
 * guarantee instead of a convention.
 */
export type TimelineEntry =
  | { kind: "activity"; at: string; activity: ActivityView }
  | {
      kind: "system";
      at: string;
      id: string;
      /** Pre-rendered sentence, e.g. "changed status from Pending to Done". */
      summary: string;
      actorName: string;
    };

/** Sorts newest first. Exported so the merge is testable in isolation. */
export function sortTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/**
 * The timestamp an activity should be filed under in the feed.
 *
 * Precedence is occurredAt → dueAt → createdAt, and the order matters: a call
 * logged three days late belongs on the day of the call, and a task belongs
 * on the day it is due. Falling back to createdAt last means an entry always
 * has a position, even if whoever wrote it supplied neither.
 */
export function timelineTimestampFor(activity: {
  occurredAt: string | null;
  dueAt: string | null;
  createdAt: string;
}): string {
  return activity.occurredAt ?? activity.dueAt ?? activity.createdAt;
}

/** A task with a due date in the past that nobody has completed. */
export function isOverdueTask(activity: ActivityView, now: Date = new Date()): boolean {
  if (activity.type !== "TASK") return false;
  if (activity.completedAt) return false;
  if (!activity.dueAt) return false;
  return new Date(activity.dueAt).getTime() < now.getTime();
}

// ── Rendering audit rows as sentences ────────────────────────────────────

/**
 * Field names as a person would say them.
 *
 * The audit table stores the Prisma field name, which is what makes it
 * analysable, but "visibleToClient" in a feed a human reads is jargon. Any
 * field not listed falls back to a de-camel-cased form, so a newly audited
 * column renders acceptably without anyone remembering to add it here.
 */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  status: "status",
  visibleToClient: "client visibility",
  salePrice: "sale price",
  saleDate: "sale date",
  offerPrice: "offer price",
  offerDurationMonths: "offer duration",
  offerComments: "offer comments",
  amountPaid: "amount paid",
  availableUnits: "available units",
  listedForRental: "rental listing",
  adminNotes: "internal notes",
  attachment: "attachment",
  completionDate: "completion date",
  targetDate: "target date",
};

export function humanizeFieldName(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

/**
 * Stored audit values as a person would read them.
 *
 * Audit values are stringified on write (see toAuditValue in
 * src/lib/data/audit.ts) because one table spans every model, so everything
 * arriving here is text — including "true", "false" and enum-shaped values
 * like "IN_PROGRESS", none of which belong in a sentence as-is.
 */
export function humanizeAuditValue(value: string | null): string {
  if (value === null || value === "") return "empty";
  if (value === "true") return "yes";
  if (value === "false") return "no";
  // SCREAMING_SNAKE enum values → "In progress". Applied only when the value
  // genuinely looks like one, so free text and numbers pass through intact.
  if (/^[A-Z][A-Z0-9_]*$/.test(value)) {
    const words = value.toLowerCase().replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return value;
}

export interface AuditSummaryInput {
  action: string;
  entityType: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Renders one audit row as a sentence fragment following an actor's name.
 *
 * Built here as a pure function rather than in the data layer so it can be
 * tested without a database and reused by anything else that needs to
 * describe a change — the AI briefing layer summarises the same rows.
 */
export function summarizeAuditEntry(entry: AuditSummaryInput): string {
  const subject = humanizeFieldName(entry.entityType);

  if (entry.action === "CREATE") return `created this ${subject}`;
  if (entry.action === "DELETE") return `deleted this ${subject}`;

  if (!entry.field) return `updated this ${subject}`;

  const field = humanizeFieldName(entry.field);
  const from = humanizeAuditValue(entry.oldValue);
  const to = humanizeAuditValue(entry.newValue);

  // "set the sale price to €X" reads better than "changed it from empty to
  // €X" when there was no prior value — which is the common case for a field
  // being filled in for the first time.
  if (entry.oldValue === null) return `set ${field} to ${to}`;
  if (entry.newValue === null) return `cleared ${field}`;

  return `changed ${field} from ${from} to ${to}`;
}
