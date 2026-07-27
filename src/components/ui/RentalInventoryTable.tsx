import Link from "next/link";
import { formatProgress } from "@/lib/format";
import type { RentalInventoryEntry } from "@/lib/data/portfolio";

/**
 * The lettings inventory — every property flagged for rental, with how far
 * its letting has progressed.
 *
 * Driven by the property's own `listedForRental` flag rather than by the
 * presence of stage records, which is what makes the "listed but not started"
 * row possible at all. Before that flag existed, a unit was invisible here
 * until someone ticked its first stage — hiding precisely the units that
 * need attention.
 */

interface RentalInventoryTableProps {
  entries: RentalInventoryEntry[];
}

export function RentalInventoryTable({ entries }: RentalInventoryTableProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No properties are listed for rental. Open a property from Available Projects and turn on &ldquo;Listed for
        rental&rdquo; to add it here.
      </p>
    );
  }

  const notStarted = entries.filter((entry) => entry.stagesCompleted === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg border border-stone-200 bg-stone-0 px-5 py-4 shadow-sm">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Listed for rental</span>
          <p className="font-display text-2xl font-extrabold tabular-nums text-stone-900">{entries.length}</p>
        </div>
        {notStarted > 0 && (
          <p className="text-xs text-sun-700">
            {notStarted} {notStarted === 1 ? "has" : "have"} no letting stage completed yet.
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-0 shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <th scope="col" className="px-5 py-3">Property</th>
              <th scope="col" className="px-5 py-3">Client</th>
              <th scope="col" className="px-5 py-3">Current stage</th>
              <th scope="col" className="px-5 py-3">Progress</th>
              <th scope="col" className="px-5 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const percent =
                entry.stagesTotal > 0 ? Math.round((entry.stagesCompleted / entry.stagesTotal) * 100) : 0;

              return (
                <tr
                  // A property with several owners yields one row per owner,
                  // so the property id alone is not unique here.
                  key={`${entry.property.id}:${entry.client?.userId ?? "unassigned"}`}
                  className="border-b border-stone-100 last:border-0"
                >
                  <td className="px-5 py-4">
                    <div className="font-medium text-stone-900">{entry.property.name}</div>
                    <div className="text-xs text-stone-500">{entry.property.area}</div>
                  </td>
                  <td className="px-5 py-4">
                    {entry.client ? (
                      <>
                        <Link
                          href={`/dashboard/clients/${entry.client.userId}`}
                          className="font-medium text-aegean-600 hover:underline"
                        >
                          {entry.client.name}
                        </Link>
                        <div className="text-xs text-stone-500">{entry.client.email}</div>
                      </>
                    ) : (
                      // Not a dash: an unassigned rental unit is a state
                      // that needs acting on, and naming it says what to do.
                      <span className="text-sun-700">No client assigned</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-stone-700">
                    {entry.currentStage ?? <span className="text-stone-400">Not started</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-100"
                        role="progressbar"
                        aria-label={`${entry.property.name} letting progress`}
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className="h-full rounded-full bg-aegean-600" style={{ width: `${percent}%` }} />
                      </div>
                      <span className="tabular-nums text-xs text-stone-600">
                        {formatProgress(entry.stagesCompleted, entry.stagesTotal)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={
                        entry.client
                          ? `/dashboard/clients/${entry.client.userId}`
                          : `/dashboard/projects/${entry.property.id}`
                      }
                      className="rounded-md px-3 py-1.5 text-sm font-semibold text-aegean-600 transition-colors hover:bg-aegean-50"
                    >
                      {entry.client ? "Manage" : "Open property"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
