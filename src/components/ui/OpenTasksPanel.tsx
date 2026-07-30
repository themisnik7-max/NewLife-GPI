import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { isOverdueTask, type ActivityView } from "@/lib/activities";

/**
 * Open tasks across the whole tenant, soonest due first.
 *
 * A deliberately read-only server component, unlike ActivityTimeline: this is
 * a triage list whose job is to get an admin to the record that needs
 * attention, not a place to work. Completing a task happens on the record,
 * where its context is — a checkbox here would let someone tick off "Chase
 * the energy certificate" without ever seeing which client it belongs to.
 *
 * Overdue is computed at render time against the clock rather than read from
 * a stored flag, for the same reason getTenantMetrics() recomputes its
 * overdue payment count: a task becomes overdue the moment its due date
 * passes, with no batch job needed to flip a column first.
 */

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Where a task's record lives. Tasks are polymorphic, so this maps the
 * entity type back to its route — the same mapping the revalidation helper in
 * src/app/dashboard/activities/actions.ts performs, kept here rather than
 * shared because that one lists paths to invalidate and this one produces a
 * single destination; merging them would give one function two jobs.
 */
function hrefFor(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "User":
      return `/dashboard/clients/${entityId}`;
    case "Property":
      return `/dashboard/projects/${entityId}`;
    case "PaymentLedger":
      return "/dashboard/payments";
    case "ConstructionMilestone":
      return "/dashboard/construction";
    default:
      return null;
  }
}

export interface OpenTasksPanelProps {
  tasks: ActivityView[];
}

export function OpenTasksPanel({ tasks }: OpenTasksPanelProps) {
  const overdueCount = tasks.filter((task) => isOverdueTask(task)).length;

  return (
    <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Open tasks
          <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
            {tasks.length}
          </span>
        </h3>
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-100 px-2.5 py-0.5 text-xs font-semibold text-coral-700">
            <AlertTriangle size={12} aria-hidden="true" />
            {overdueCount} overdue
          </span>
        )}
      </header>

      {tasks.length === 0 ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-stone-500">
          <CheckCircle2 size={15} className="text-green-600" aria-hidden="true" />
          Nothing outstanding.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-stone-100">
          {tasks.map((task) => {
            const overdue = isOverdueTask(task);
            const href = hrefFor(task.entityType, task.entityId);

            return (
              <li key={task.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <CalendarClock
                  size={15}
                  className={overdue ? "text-coral-600" : "text-stone-400"}
                  aria-hidden="true"
                />

                <div className="min-w-0 flex-1">
                  {/* Falls back to plain text for an entity type with no
                  route — a dead link is worse than no link. */}
                  {href ? (
                    <Link
                      href={href}
                      className="truncate text-sm font-medium text-stone-900 hover:text-aegean-700 hover:underline"
                    >
                      {task.subject}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium text-stone-900">{task.subject}</span>
                  )}
                  <p className="mt-0.5 text-xs text-stone-500">{task.createdByName}</p>
                </div>

                {task.dueAt && (
                  <span
                    className={`shrink-0 text-xs font-semibold ${
                      overdue ? "text-coral-700" : "text-stone-500"
                    }`}
                  >
                    {overdue ? "Was due " : "Due "}
                    {dateFormatter.format(new Date(task.dueAt))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
