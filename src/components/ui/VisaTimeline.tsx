import type { VisaStepEntry } from "@/lib/data/visa";

// Connector-stepper visual, matching RentalRoadmap's established pattern —
// unlike ConstructionMilestones, a visa timeline genuinely is a strict
// ordered sequence (stepOrder), so numbered circles + a connecting line
// between them is honest to the data, not just decoration.
const STATUS_LABEL: Record<VisaStepEntry["status"], string> = {
  PENDING: "Upcoming",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Done",
};

const STATUS_BADGE_CLASS: Record<VisaStepEntry["status"], string> = {
  PENDING: "bg-gray-100 text-gray-500",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
};

const STATUS_CIRCLE_CLASS: Record<VisaStepEntry["status"], string> = {
  PENDING: "bg-gray-200 text-gray-500",
  IN_PROGRESS: "animate-pulse bg-blue-500 text-white",
  COMPLETED: "bg-green-500 text-white",
};

const STATUS_LINE_CLASS: Record<VisaStepEntry["status"], string> = {
  PENDING: "bg-gray-200",
  IN_PROGRESS: "bg-gray-200",
  COMPLETED: "bg-green-500",
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function formatCompletedAt(isoDateTime: string): string {
  return dateFormatter.format(new Date(isoDateTime));
}

export interface VisaTimelineProps {
  steps: VisaStepEntry[];
}

export function VisaTimeline({ steps }: VisaTimelineProps) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <li
            key={step.id}
            aria-current={step.status === "IN_PROGRESS" ? "step" : undefined}
            className="flex gap-4"
          >
            <div className="flex flex-col items-center">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${STATUS_CIRCLE_CLASS[step.status]}`}
              >
                {step.stepOrder}
              </span>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`w-0.5 flex-1 ${STATUS_LINE_CLASS[step.status]}`}
                  style={{ minHeight: 28 }}
                />
              )}
            </div>
            <div className="pb-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-stone-900">{step.title}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STATUS_BADGE_CLASS[step.status]}`}
                >
                  {STATUS_LABEL[step.status]}
                </span>
              </div>
              {step.description && <p className="mt-1 text-sm text-stone-600">{step.description}</p>}
              {step.completedAt && (
                <p className="mt-1 text-xs text-stone-500">Completed {formatCompletedAt(step.completedAt)}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
