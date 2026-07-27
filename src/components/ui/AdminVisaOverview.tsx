import Link from "next/link";
import { Check } from "lucide-react";
import { formatDate, formatProgress } from "@/lib/format";
import type { ClientVisaJourney } from "@/lib/data/visa";

/**
 * Every client's Golden Visa journey on one page.
 *
 * Deliberately not the full VisaTimeline component repeated per client:
 * that renders one application at reading depth, and stacking forty of them
 * produces a page nobody scrolls. This compresses each journey to a single
 * scannable strip of step pills, and links through to the client's profile
 * for the detail.
 *
 * Clients with no steps are shown, not hidden — an application that has not
 * been started is exactly what a supervisor needs to see. The data layer
 * sorts fewest-completed first for the same reason.
 */

interface AdminVisaOverviewProps {
  journeys: ClientVisaJourney[];
}

/**
 * Keyed on the status union rather than `string`, so there is no fallback
 * branch to write: a new status added to VisaStepEntry becomes a compile
 * error here instead of silently rendering as PENDING. The data layer
 * already throws on an unrecognized value from the database, so an
 * out-of-range status cannot reach this component.
 */
const STEP_TONE: Record<ClientVisaJourney["steps"][number]["status"], string> = {
  COMPLETED: "bg-olive-100 text-olive-700",
  IN_PROGRESS: "bg-sun-100 text-sun-700",
  PENDING: "bg-stone-100 text-stone-500",
};

export function AdminVisaOverview({ journeys }: AdminVisaOverviewProps) {
  if (journeys.length === 0) {
    return <p className="text-sm text-stone-500">No clients yet, so there are no Golden Visa applications to track.</p>;
  }

  return (
    <div className="space-y-3">
      {journeys.map((journey) => (
        <section key={journey.userId} className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <Link
                href={`/dashboard/clients/${journey.userId}`}
                className="font-medium text-stone-900 hover:text-aegean-600 hover:underline"
              >
                {journey.name}
              </Link>
              <p className="text-xs text-stone-500">{journey.email}</p>
            </div>
            <span className="text-sm tabular-nums text-stone-600">
              {journey.total === 0 ? "Not started" : `${formatProgress(journey.completed, journey.total)} steps`}
            </span>
          </div>

          {journey.steps.length === 0 ? (
            <p className="mt-3 text-sm text-stone-400">
              No application steps have been created for this client yet.
            </p>
          ) : (
            <ol className="mt-3 flex flex-wrap gap-2">
              {journey.steps.map((step) => (
                <li
                  key={step.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STEP_TONE[step.status]}`}
                  // Completion date lives in the title rather than inline:
                  // showing forty dates would swamp the progress signal this
                  // row exists to give, but the date still has to be reachable.
                  title={step.completedAt ? `Completed ${formatDate(step.completedAt)}` : step.status}
                >
                  {step.status === "COMPLETED" && <Check size={12} aria-hidden="true" />}
                  {step.title}
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
