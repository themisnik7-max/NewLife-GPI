import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import type { TenantPaymentsOverview } from "@/lib/data/ledgers";

/**
 * Every installment in the tenant — pending, part-paid, settled and overdue.
 *
 * Status is encoded in both a word and a colour, never colour alone: this is
 * the page where "which of these needs chasing" has to read at a glance, and
 * a colour-only signal is invisible to anyone who cannot distinguish the hues.
 *
 * The footer totals come from the same rows rendered above, computed in the
 * data layer — see getTenantPaymentsOverview() on why they are not a separate
 * aggregate query.
 */

interface AdminPaymentsTableProps {
  overview: TenantPaymentsOverview;
}

function StatusBadge({ status, isDelayed }: { status: string; isDelayed: boolean }) {
  // Delay is computed from the clock, so a row can be PENDING and overdue at
  // the same time. Overdue wins the badge: it is the actionable fact.
  const [label, tone] = isDelayed
    ? ["Overdue", "bg-coral-100 text-coral-700"]
    : status === "PAID"
      ? ["Paid", "bg-olive-100 text-olive-700"]
      : ["Pending", "bg-stone-100 text-stone-600"];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}

export function AdminPaymentsTable({ overview }: AdminPaymentsTableProps) {
  const { entries, totals } = overview;

  if (entries.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No payment installments have been created yet. Add one from a client&apos;s profile.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-0 shadow-sm">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-xs font-semibold uppercase tracking-wide text-stone-500">
            <th scope="col" className="px-5 py-3">Client</th>
            <th scope="col" className="px-5 py-3">Property</th>
            <th scope="col" className="px-5 py-3">Due</th>
            <th scope="col" className="px-5 py-3">Status</th>
            <th scope="col" className="px-5 py-3 text-right">Amount</th>
            {/* "Collected", not "Paid": a column headed "Paid" sits directly
                beside a status badge that also reads "Paid", and the two mean
                different things — one is an amount, the other a state. */}
            <th scope="col" className="px-5 py-3 text-right">Collected</th>
            <th scope="col" className="px-5 py-3 text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-stone-100 last:border-0">
              <td className="px-5 py-4">
                <Link
                  href={`/dashboard/clients/${entry.userId}`}
                  className="font-medium text-aegean-600 hover:underline"
                >
                  {entry.clientName}
                </Link>
                <div className="text-xs text-stone-500">{entry.clientEmail}</div>
              </td>
              <td className="px-5 py-4 text-stone-700">{entry.propertyName}</td>
              <td className="px-5 py-4 tabular-nums text-stone-700">{formatDate(entry.dueDate)}</td>
              <td className="px-5 py-4">
                <StatusBadge status={entry.status} isDelayed={entry.isDelayed} />
                {entry.penaltyAmount > 0 && (
                  <div className="mt-1 text-xs text-coral-700">
                    +{formatCurrency(entry.penaltyAmount)} penalty
                  </div>
                )}
              </td>
              <td className="px-5 py-4 text-right tabular-nums text-stone-700">{formatCurrency(entry.amount)}</td>
              <td className="px-5 py-4 text-right tabular-nums text-olive-700">
                {formatCurrency(entry.amountPaid)}
              </td>
              <td className="px-5 py-4 text-right tabular-nums">
                <span className={entry.outstanding > 0 ? "font-semibold text-stone-900" : "text-stone-400"}>
                  {formatCurrency(entry.outstanding)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-stone-200 bg-stone-50 text-sm font-semibold text-stone-900">
            <td className="px-5 py-3" colSpan={3}>
              {entries.length} installment{entries.length === 1 ? "" : "s"}
            </td>
            <td className="px-5 py-3 text-xs font-normal text-stone-600">
              {totals.overdueCount > 0 ? `${totals.overdueCount} overdue` : "None overdue"}
            </td>
            <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(totals.billed)}</td>
            <td className="px-5 py-3 text-right tabular-nums text-olive-700">
              {formatCurrency(totals.collected)}
            </td>
            <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(totals.outstanding)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
