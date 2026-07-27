import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import type { SoldProperty } from "@/lib/data/portfolio";

/**
 * Every property the business has sold, with its buyers — the admin view of
 * "My Property".
 *
 * A property with several buyers is one row with several names, not several
 * rows: the unit is the thing being tracked, and repeating its details per
 * buyer would make the count of rows disagree with the count of properties.
 */

interface SoldPropertiesTableProps {
  properties: SoldProperty[];
}

export function SoldPropertiesTable({ properties }: SoldPropertiesTableProps) {
  if (properties.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No properties have been sold yet. Assign a property to a client from their profile and it will appear here.
      </p>
    );
  }

  const portfolioValue = properties.reduce((sum, entry) => sum + entry.totalSaleValue, 0);
  const missingPrices = properties.reduce((sum, entry) => sum + entry.ownersMissingSalePrice, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg border border-stone-200 bg-stone-0 px-5 py-4 shadow-sm">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Sold</span>
          <p className="font-display text-2xl font-extrabold tabular-nums text-stone-900">{properties.length}</p>
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Recorded value</span>
          <p className="font-display text-2xl font-extrabold tabular-nums text-stone-900">
            {formatCurrency(portfolioValue)}
          </p>
        </div>
        {missingPrices > 0 && (
          <p className="text-xs text-sun-700">
            {missingPrices === 1
              ? "1 sale has no price recorded and is excluded from the total."
              : `${missingPrices} sales have no price recorded and are excluded from the total.`}
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-0 shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <th scope="col" className="px-5 py-3">Property</th>
              <th scope="col" className="px-5 py-3">Bought by</th>
              <th scope="col" className="px-5 py-3">Sale date</th>
              <th scope="col" className="px-5 py-3 text-right">Sale price</th>
              <th scope="col" className="px-5 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {properties.map(({ property, owners, totalSaleValue }) => (
              <tr key={property.id} className="border-b border-stone-100 last:border-0 align-top">
                <td className="px-5 py-4">
                  <div className="font-medium text-stone-900">{property.name}</div>
                  <div className="text-xs text-stone-500">{property.area}</div>
                  {property.listedForRental && (
                    <span className="mt-1.5 inline-flex rounded-full bg-aegean-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-aegean-700">
                      For rental
                    </span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <ul className="space-y-1">
                    {owners.map((owner) => (
                      <li key={owner.userId}>
                        <Link
                          href={`/dashboard/clients/${owner.userId}`}
                          className="font-medium text-aegean-600 hover:underline"
                        >
                          {owner.name}
                        </Link>
                        <div className="text-xs text-stone-500">{owner.email}</div>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-5 py-4">
                  <ul className="space-y-1 text-stone-700">
                    {owners.map((owner) => (
                      <li key={owner.userId} className="tabular-nums">
                        {owner.saleDate ? (
                          formatDate(owner.saleDate)
                        ) : (
                          // Says which date is missing rather than showing a
                          // bare dash: the recorded-in-app timestamp exists
                          // and is a different fact, so naming it prevents
                          // someone reading it as the sale date.
                          <span className="text-stone-400" title={`Recorded in app ${formatDate(owner.recordedAt)}`}>
                            Not recorded
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-5 py-4 text-right">
                  <ul className="space-y-1">
                    {owners.map((owner) => (
                      <li key={owner.userId} className="tabular-nums text-stone-700">
                        {owner.salePrice === null ? (
                          <span className="text-stone-400">—</span>
                        ) : (
                          formatCurrency(owner.salePrice)
                        )}
                      </li>
                    ))}
                  </ul>
                  {owners.length > 1 && (
                    <div className="mt-1 border-t border-stone-100 pt-1 text-xs font-semibold tabular-nums text-stone-900">
                      {formatCurrency(totalSaleValue)}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/dashboard/property/${property.id}`}
                    className="rounded-md px-3 py-1.5 text-sm font-semibold text-aegean-600 transition-colors hover:bg-aegean-50"
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
