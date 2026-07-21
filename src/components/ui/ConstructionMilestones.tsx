import type { MilestoneEntry } from "@/lib/data/construction";

// Real per-milestone status, not a derived index like RentalRoadmap's
// currentStage — a milestone's own row genuinely carries PENDING/
// IN_PROGRESS/COMPLETED (prisma/schema.prisma's MilestoneStatus), so it's
// rendered directly per row rather than compared against a single "current
// stage" the way RentalRoadmap compares each stage to one currentIndex.
const STATUS_LABEL: Record<MilestoneEntry["status"], string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

const STATUS_BADGE_CLASS: Record<MilestoneEntry["status"], string> = {
  PENDING: "bg-gray-100 text-gray-500",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
};

const STATUS_DOT_CLASS: Record<MilestoneEntry["status"], string> = {
  PENDING: "bg-gray-200",
  IN_PROGRESS: "animate-pulse bg-blue-500",
  COMPLETED: "bg-green-500",
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate));
}

export interface ConstructionMilestonesProps {
  milestones: MilestoneEntry[];
}

export function ConstructionMilestones({ milestones }: ConstructionMilestonesProps) {
  const completedCount = milestones.filter((milestone) => milestone.status === "COMPLETED").length;
  const overallPct = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-medium text-stone-900">Overall progress</span>
          <span className="text-stone-600">
            {completedCount} of {milestones.length} milestones complete
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200" role="presentation">
          <div className="h-full rounded-full bg-green-500" style={{ width: `${overallPct}%` }} />
        </div>
      </div>

      <ol className="flex flex-col gap-4">
        {milestones.map((milestone) => (
          <li key={milestone.id} className="flex items-start gap-3 rounded-md border border-stone-200 bg-white p-4">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[milestone.status]}`}
            />
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-stone-900">{milestone.title}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STATUS_BADGE_CLASS[milestone.status]}`}
                >
                  {STATUS_LABEL[milestone.status]}
                </span>
              </div>
              {milestone.description && <p className="mt-1 text-sm text-stone-600">{milestone.description}</p>}
              <p className="mt-2 text-xs text-stone-500">
                {milestone.completionDate
                  ? `Completed ${formatDate(milestone.completionDate)}`
                  : `Target ${formatDate(milestone.targetDate)}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
