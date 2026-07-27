import { FileText, Image as ImageIcon, Check } from "lucide-react";
import type { RentalStageView } from "@/lib/rentalStages";

/**
 * Read-only view of the rental workflow.
 *
 * Replaces RentalRoadmap, which derived every stage's state from a single
 * "current stage" index — a model that could only ever say "everything
 * before here is done." Each stage now carries its own status, so this
 * renders what is actually recorded rather than what the ordering implies.
 * Numbered circles and connectors are kept from the old component: the
 * stages genuinely are an ordered sequence, so the visual remains honest.
 */

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" });
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export interface RentalStageTrackerProps {
  stages: RentalStageView[];
}

export function RentalStageTracker({ stages }: RentalStageTrackerProps) {
  const completed = stages.filter((stage) => stage.status === "DONE").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-medium text-stone-900">Overall progress</span>
          <span className="text-stone-600">
            {completed} of {stages.length} stages complete
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200" role="presentation">
          <div
            className="h-full rounded-full bg-green-500"
            style={{ width: `${stages.length > 0 ? Math.round((completed / stages.length) * 100) : 0}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-col">
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1;
          const isDone = stage.status === "DONE";

          return (
            <li key={stage.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isDone ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {isDone ? <Check size={14} aria-hidden="true" /> : stage.order}
                </span>
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={`w-0.5 flex-1 ${isDone ? "bg-green-500" : "bg-gray-200"}`}
                    style={{ minHeight: 28 }}
                  />
                )}
              </div>

              <div className="flex-1 pb-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">{stage.label}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      isDone ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {isDone ? "Done" : "Pending"}
                  </span>
                </div>

                {stage.completedAt && (
                  <p className="mt-1 text-xs text-stone-500">
                    Completed {dateFormatter.format(new Date(stage.completedAt))}
                  </p>
                )}

                {stage.hasAttachment && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-stone-700">
                    {stage.slot === "photo" ? (
                      <ImageIcon size={14} aria-hidden="true" />
                    ) : (
                      <FileText size={14} aria-hidden="true" />
                    )}
                    {stage.attachmentFilename}
                  </p>
                )}

                {stage.hasOfferFields &&
                  (stage.offerPrice !== null ||
                    stage.offerDurationMonths !== null ||
                    stage.offerComments !== null) && (
                    <dl className="mt-2 flex flex-col gap-1 rounded-md bg-stone-50 px-3 py-2 text-sm">
                      {stage.offerPrice !== null && (
                        <div className="flex gap-2">
                          <dt className="text-stone-500">Price</dt>
                          <dd className="font-semibold text-stone-900">
                            {currencyFormatter.format(stage.offerPrice)}
                          </dd>
                        </div>
                      )}
                      {stage.offerDurationMonths !== null && (
                        <div className="flex gap-2">
                          <dt className="text-stone-500">Duration</dt>
                          <dd className="font-semibold text-stone-900">
                            {stage.offerDurationMonths} {stage.offerDurationMonths === 1 ? "month" : "months"}
                          </dd>
                        </div>
                      )}
                      {stage.offerComments && (
                        <div className="flex gap-2">
                          <dt className="text-stone-500">Comments</dt>
                          <dd className="text-stone-700">{stage.offerComments}</dd>
                        </div>
                      )}
                    </dl>
                  )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
