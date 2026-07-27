import Link from "next/link";
import { Users, Building2, Wallet, KeyRound, Stamp, AlertTriangle } from "lucide-react";
import { formatCurrencyCompact, formatProgress } from "@/lib/format";
import type { TenantMetrics } from "@/lib/data/metrics";

/**
 * The admin Overview — a supervisor's snapshot of the whole business.
 *
 * Purely presentational: it receives a fully-computed TenantMetrics and does
 * no arithmetic of its own beyond percentages for the progress bars. Deriving
 * figures here would put the same calculation in two places (this component
 * and getTenantMetrics), which is how a dashboard ends up disagreeing with
 * the page it links to.
 *
 * Every card links to the page that owns its detail — the point of a summary
 * is to be a starting point, and a number you cannot click through to is a
 * dead end.
 */

interface MetricsDashboardProps {
  metrics: TenantMetrics;
}

function StatCard({
  label,
  value,
  detail,
  href,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
  icon: typeof Users;
  tone?: "default" | "warning";
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm transition-colors hover:border-aegean-300"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</span>
        <Icon
          size={16}
          aria-hidden="true"
          className={tone === "warning" ? "text-coral-600" : "text-stone-400 group-hover:text-aegean-600"}
        />
      </div>
      {/* tabular-nums so the figures across the row line up on their digits */}
      <span
        className={`font-display text-3xl font-extrabold tabular-nums ${
          tone === "warning" ? "text-coral-700" : "text-stone-900"
        }`}
      >
        {value}
      </span>
      <span className="text-xs text-stone-500">{detail}</span>
    </Link>
  );
}

function ProgressRow({ label, completed, total }: { label: string; completed: number; total: number }) {
  // Zero total means "nothing to do yet", which is 0% progress, not a
  // division by zero and not 100% complete.
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-stone-700">{label}</span>
        <span className="tabular-nums text-stone-500">
          {formatProgress(completed, total)} ({percent}%)
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-stone-100"
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-aegean-600" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function MetricsDashboard({ metrics }: MetricsDashboardProps) {
  const { clients, properties, sales, payments, visa, rentals } = metrics;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Clients"
          value={String(clients.total)}
          detail={`${clients.withProperty} with a property assigned`}
          href="/dashboard/clients"
          icon={Users}
        />
        <StatCard
          label="Properties sold"
          value={String(properties.sold)}
          detail={`${properties.total} in the catalog · ${properties.availableUnits} units available`}
          href="/dashboard/property"
          icon={Building2}
        />
        <StatCard
          label="Outstanding"
          value={formatCurrencyCompact(payments.outstanding)}
          detail={
            payments.overdueCount > 0
              ? `${payments.overdueCount} installment${payments.overdueCount === 1 ? "" : "s"} overdue`
              : "Nothing overdue"
          }
          href="/dashboard/payments"
          icon={payments.overdueCount > 0 ? AlertTriangle : Wallet}
          tone={payments.overdueCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Listed for rental"
          value={String(rentals.unitsListed)}
          detail={`${rentals.clientsInProgress} letting${rentals.clientsInProgress === 1 ? "" : "s"} underway`}
          href="/dashboard/rental"
          icon={KeyRound}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Sales recorded</h2>
          <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-stone-900">
            {formatCurrencyCompact(sales.valueRecorded)}
          </p>
          {/* The caveat is rendered next to the figure, not buried in a
              footnote: a portfolio total computed from partial data is
              misleading unless its incompleteness is equally visible. */}
          {sales.missingPrice > 0 ? (
            <p className="mt-2 text-xs text-sun-700">
              Excludes {sales.missingPrice} sale{sales.missingPrice === 1 ? "" : "s"} with no price on file.
            </p>
          ) : (
            <p className="mt-2 text-xs text-stone-500">Every recorded sale has a price on file.</p>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Payments</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-600">Billed</dt>
              <dd className="tabular-nums font-medium text-stone-900">{formatCurrencyCompact(payments.billed)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Collected</dt>
              <dd className="tabular-nums font-medium text-olive-700">
                {formatCurrencyCompact(payments.collected)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-stone-100 pt-2">
              <dt className="text-stone-600">Outstanding</dt>
              <dd className="tabular-nums font-semibold text-stone-900">
                {formatCurrencyCompact(payments.outstanding)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="space-y-4 rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Workflow progress</h2>
          <ProgressRow
            label={`Golden Visa · ${visa.clientsInProgress} client${visa.clientsInProgress === 1 ? "" : "s"}`}
            completed={visa.stepsCompleted}
            total={visa.stepsTotal}
          />
          <ProgressRow
            label={`Lettings · ${rentals.unitsListed} unit${rentals.unitsListed === 1 ? "" : "s"}`}
            completed={rentals.stagesCompleted}
            total={rentals.stagesTotal}
          />
          <div className="flex gap-4 pt-1 text-xs">
            <Link href="/dashboard/visa" className="font-semibold text-aegean-600 hover:underline">
              <Stamp size={12} aria-hidden="true" className="mr-1 inline" />
              Golden Visa
            </Link>
            <Link href="/dashboard/rental" className="font-semibold text-aegean-600 hover:underline">
              <KeyRound size={12} aria-hidden="true" className="mr-1 inline" />
              Rentals
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
