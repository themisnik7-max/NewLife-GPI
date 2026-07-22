import Link from "next/link";
import type { Project } from "@/lib/projects";
import { RENTAL_STAGES, type RentalStage } from "@/components/ui/RentalRoadmap";
import type { MilestoneEntry } from "@/lib/data/construction";
import type { VisaStepEntry } from "@/lib/data/visa";
import type { LedgerEntry } from "@/lib/data/ledgers";

const RENTAL_STAGE_LABEL: Record<RentalStage, string> = Object.fromEntries(
  RENTAL_STAGES.map(({ stage, label }) => [stage, label]),
) as Record<RentalStage, string>;

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" });
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export interface ClientOverviewSummaryProps {
  property: Project | null;
  rentalStage: RentalStage | null;
  milestones: MilestoneEntry[];
  visaSteps: VisaStepEntry[];
  ledgerEntries: LedgerEntry[];
}

function SummaryCard({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</div>
      <div className="mt-2 text-sm text-stone-900">{children}</div>
    </Link>
  );
}

/**
 * Aggregated read-only summary of a single client's data across every other
 * domain page (property/construction/visa/payments/rental) — the "overview
 * of the other pages" piece. Used in two places: a client's own Overview
 * (src/app/dashboard/page.tsx, non-admin branch) and an admin's per-client
 * drill-down (src/app/dashboard/clients/[userId]/page.tsx) — the same
 * component either way, just fed a different user's already-resolved data.
 */
export function ClientOverviewSummary({
  property,
  rentalStage,
  milestones,
  visaSteps,
  ledgerEntries,
}: ClientOverviewSummaryProps) {
  const completedMilestones = milestones.filter((milestone) => milestone.status === "COMPLETED").length;
  const completedSteps = visaSteps.filter((step) => step.status === "COMPLETED").length;
  const outstandingBalance = ledgerEntries.reduce((sum, entry) => sum + (entry.amount - entry.amountPaid), 0);
  const nextDue = ledgerEntries.find((entry) => entry.status !== "PAID");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryCard title="Property" href="/dashboard/property">
        {property ? (
          <>
            <div className="font-medium">{property.name}</div>
            <div className="text-stone-500">{property.address}</div>
          </>
        ) : (
          "No property assigned yet."
        )}
      </SummaryCard>

      <SummaryCard title="Construction" href="/dashboard/construction">
        {milestones.length > 0
          ? `${completedMilestones} of ${milestones.length} milestones complete`
          : "No milestones on record yet."}
      </SummaryCard>

      <SummaryCard title="Golden Visa" href="/dashboard/visa">
        {visaSteps.length > 0 ? `${completedSteps} of ${visaSteps.length} steps complete` : "No visa steps on record yet."}
      </SummaryCard>

      <SummaryCard title="Payments" href="/dashboard/payments">
        {ledgerEntries.length > 0 ? (
          <>
            <div className="font-medium">{currencyFormatter.format(outstandingBalance)} outstanding</div>
            {nextDue && <div className="text-stone-500">Next due {dateFormatter.format(new Date(nextDue.dueDate))}</div>}
          </>
        ) : (
          "No payment installments on record yet."
        )}
      </SummaryCard>

      <SummaryCard title="Rental & taxes" href="/dashboard/rental">
        {rentalStage ? RENTAL_STAGE_LABEL[rentalStage] : "No rental progress yet."}
      </SummaryCard>
    </div>
  );
}
