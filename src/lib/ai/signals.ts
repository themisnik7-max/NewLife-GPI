// Client/test-safe: the deterministic half of the AI features.
//
// ⚠️ THE DIVISION OF LABOUR HERE IS THE WHOLE DESIGN, and it is deliberate.
// Everything factual — which deals have stalled, for how many days, how much
// money is outstanding, how many stages are incomplete — is computed HERE, in
// plain functions, from data the database already holds. The LLM is given
// those computed facts and asked only to write them up.
//
// The alternative — handing raw rows to a model and asking "what should I
// worry about?" — produces a number that looks authoritative and can be
// wrong, in a product where the numbers are money. A model cannot miscount
// something it was never asked to count. It also makes the expensive half of
// the feature testable without a network call, and means the panel still
// works when no API key is configured: the signals render, only the prose is
// missing.

export type SignalSeverity = "critical" | "warning" | "info";

export interface Signal {
  /** Stable identifier for the KIND of signal, not the instance. */
  kind: string;
  severity: SignalSeverity;
  /** One line, already containing the specific numbers. */
  message: string;
  /** Where to go to act on it, when there is a single obvious destination. */
  href?: string;
}

/** How long a deal may sit untouched before it is called stalled. */
export const STALL_THRESHOLD_DAYS = 14;

/** Deals worth more than this get a higher severity when they stall — a
 * stalled €500k deal and a stalled €5k deal are not the same problem. */
const HIGH_VALUE_THRESHOLD = 200_000;

export function daysBetween(from: Date | string, to: Date): number {
  const start = typeof from === "string" ? new Date(from) : from;
  const millis = to.getTime() - start.getTime();
  return Math.floor(millis / (1000 * 60 * 60 * 24));
}

export interface DealSignalInput {
  id: string;
  title: string;
  stage: string;
  stageLabel: string;
  value: number | null;
  expectedCloseDate: string | null;
  updatedAt: string;
  contactName: string;
}

/**
 * Deals that have not moved in a while, or whose expected close date has
 * passed without them closing.
 *
 * `updatedAt` is the staleness clock rather than a scan of AuditLog: any
 * edit to a deal touches it, so "nothing has happened to this record" is
 * exactly what an old `updatedAt` means. Reading the audit trail would be
 * more precise about *stage* changes specifically, and is the right upgrade
 * if "edited but not advanced" ever needs distinguishing — it does not yet.
 *
 * Closed deals are skipped: a Won deal that has not moved in six months is
 * not a problem, it is a sale.
 */
export function detectStalledDeals(
  deals: readonly DealSignalInput[],
  now: Date = new Date(),
): Signal[] {
  const signals: Signal[] = [];

  for (const deal of deals) {
    if (deal.stage === "WON" || deal.stage === "LOST") continue;

    const idleDays = daysBetween(deal.updatedAt, now);
    if (idleDays >= STALL_THRESHOLD_DAYS) {
      const isHighValue = (deal.value ?? 0) >= HIGH_VALUE_THRESHOLD;
      signals.push({
        kind: "deal_stalled",
        severity: isHighValue ? "critical" : "warning",
        message: `"${deal.title}" (${deal.contactName}) has sat at ${deal.stageLabel} for ${idleDays} days.`,
        href: "/dashboard/pipeline",
      });
    }

    if (deal.expectedCloseDate) {
      const overdueDays = daysBetween(deal.expectedCloseDate, now);
      if (overdueDays > 0) {
        signals.push({
          kind: "deal_close_date_passed",
          severity: "warning",
          message: `"${deal.title}" was expected to close ${overdueDays} day${overdueDays === 1 ? "" : "s"} ago and is still at ${deal.stageLabel}.`,
          href: "/dashboard/pipeline",
        });
      }
    }
  }

  return signals;
}

export interface PipelineHealthInput {
  openCount: number;
  missingValueCount: number;
  openValue: number;
}

/**
 * Signals about the shape of the pipeline as a whole rather than any one
 * deal — the questions a forecast cannot answer honestly while they hold.
 */
export function detectPipelineHealthSignals(input: PipelineHealthInput): Signal[] {
  const signals: Signal[] = [];

  if (input.missingValueCount > 0) {
    signals.push({
      kind: "deals_missing_value",
      // Info, not warning: an unpriced early-stage lead is normal. What it
      // is not is invisible — the forecast silently excludes it, so the gap
      // is stated rather than left for someone to discover.
      severity: "info",
      message: `${input.missingValueCount} open deal${input.missingValueCount === 1 ? " has" : "s have"} no value recorded, so the forecast excludes ${input.missingValueCount === 1 ? "it" : "them"}.`,
      href: "/dashboard/pipeline",
    });
  }

  if (input.openCount === 0) {
    signals.push({
      kind: "pipeline_empty",
      severity: "warning",
      message: "There are no open deals in the pipeline.",
      href: "/dashboard/pipeline",
    });
  }

  return signals;
}

export interface PaymentSignalInput {
  overdueCount: number;
  outstanding: number;
}

export function detectPaymentSignals(input: PaymentSignalInput): Signal[] {
  if (input.overdueCount === 0) return [];

  return [
    {
      kind: "payments_overdue",
      severity: "critical",
      message: `${input.overdueCount} installment${input.overdueCount === 1 ? " is" : "s are"} past due, with €${Math.round(input.outstanding).toLocaleString("en-GB")} outstanding in total.`,
      href: "/dashboard/payments",
    },
  ];
}

export interface TaskSignalInput {
  overdueTaskCount: number;
}

export function detectTaskSignals(input: TaskSignalInput): Signal[] {
  if (input.overdueTaskCount === 0) return [];

  return [
    {
      kind: "tasks_overdue",
      severity: "warning",
      message: `${input.overdueTaskCount} task${input.overdueTaskCount === 1 ? " is" : "s are"} past their due date.`,
      href: "/dashboard",
    },
  ];
}

const SEVERITY_ORDER: Record<SignalSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Most severe first, preserving the order within each band so the caller's
 * own ordering (newest, largest) survives. */
export function sortSignals(signals: readonly Signal[]): Signal[] {
  return [...signals].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * Renders the computed signals as the factual block handed to the model.
 *
 * The model is asked to write *from* this, never to derive it. Numbering the
 * lines gives the prose something unambiguous to refer back to and makes a
 * hallucinated fifth item obvious when there were only four.
 */
export function signalsToPromptContext(signals: readonly Signal[]): string {
  if (signals.length === 0) return "No issues were detected.";

  return signals
    .map((signal, index) => `${index + 1}. [${signal.severity}] ${signal.message}`)
    .join("\n");
}
