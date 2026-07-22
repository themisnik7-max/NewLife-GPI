import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientOverviewSummary } from "@/components/ui/ClientOverviewSummary";
import { MOCK_OWNED_PROPERTY } from "@/lib/projects";
import type { MilestoneEntry } from "@/lib/data/construction";
import type { VisaStepEntry } from "@/lib/data/visa";
import type { LedgerEntry } from "@/lib/data/ledgers";

const MILESTONES: MilestoneEntry[] = [
  {
    id: "m1",
    propertyId: "property-1",
    title: "Foundation poured",
    description: null,
    status: "COMPLETED",
    targetDate: "2026-03-15",
    completionDate: "2026-03-20",
  },
  {
    id: "m2",
    propertyId: "property-1",
    title: "Roofing",
    description: null,
    status: "PENDING",
    targetDate: "2026-11-01",
    completionDate: null,
  },
];

const VISA_STEPS: VisaStepEntry[] = [
  {
    id: "s1",
    stepOrder: 1,
    title: "Submit application",
    description: null,
    status: "COMPLETED",
    completedAt: "2026-02-01T10:00:00.000Z",
  },
  {
    id: "s2",
    stepOrder: 2,
    title: "Legal review",
    description: null,
    status: "PENDING",
    completedAt: null,
  },
];

const LEDGER_ENTRIES: LedgerEntry[] = [
  {
    id: "l1",
    propertyId: "property-1",
    userId: "user_1",
    amount: 1000,
    amountPaid: 400,
    dueDate: "2026-09-01",
    status: "PENDING",
    isDelayed: false,
    penaltyAmount: 0,
  },
];

describe("ClientOverviewSummary", () => {
  it("renders the owned property's name and address, linking to the property page", () => {
    render(
      <ClientOverviewSummary property={MOCK_OWNED_PROPERTY} rentalStage={null} milestones={[]} visaSteps={[]} ledgerEntries={[]} />,
    );

    expect(screen.getByText(MOCK_OWNED_PROPERTY.name)).toBeInTheDocument();
    expect(screen.getByText(MOCK_OWNED_PROPERTY.address)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(MOCK_OWNED_PROPERTY.name) })).toHaveAttribute(
      "href",
      "/dashboard/property",
    );
  });

  it("shows a no-property message and does not crash when property is null", () => {
    render(<ClientOverviewSummary property={null} rentalStage={null} milestones={[]} visaSteps={[]} ledgerEntries={[]} />);

    expect(screen.getByText("No property assigned yet.")).toBeInTheDocument();
  });

  it("computes the real completed-milestone count rather than a fabricated percentage", () => {
    render(
      <ClientOverviewSummary property={null} rentalStage={null} milestones={MILESTONES} visaSteps={[]} ledgerEntries={[]} />,
    );

    expect(screen.getByText("1 of 2 milestones complete")).toBeInTheDocument();
  });

  it("computes the real completed-step count for the visa timeline", () => {
    render(
      <ClientOverviewSummary property={null} rentalStage={null} milestones={[]} visaSteps={VISA_STEPS} ledgerEntries={[]} />,
    );

    expect(screen.getByText("1 of 2 steps complete")).toBeInTheDocument();
  });

  it("computes the real outstanding balance and next due date from ledger entries", () => {
    render(
      <ClientOverviewSummary property={null} rentalStage={null} milestones={[]} visaSteps={[]} ledgerEntries={LEDGER_ENTRIES} />,
    );

    expect(screen.getByText("€600.00 outstanding")).toBeInTheDocument();
    // en-GB's short month form for September is "Sept" (4 letters) — see the
    // same note in ConstructionMilestones.test.tsx.
    expect(screen.getByText("Next due 1 Sept 2026")).toBeInTheDocument();
  });

  it("renders the human-readable label for a real rental stage", () => {
    render(
      <ClientOverviewSummary property={null} rentalStage="VENDORS_ENGAGED" milestones={[]} visaSteps={[]} ledgerEntries={[]} />,
    );

    expect(screen.getByText("Vendors Engaged")).toBeInTheDocument();
  });

  it("shows empty-state text for every card when there is no data at all", () => {
    render(<ClientOverviewSummary property={null} rentalStage={null} milestones={[]} visaSteps={[]} ledgerEntries={[]} />);

    expect(screen.getByText("No milestones on record yet.")).toBeInTheDocument();
    expect(screen.getByText("No visa steps on record yet.")).toBeInTheDocument();
    expect(screen.getByText("No payment installments on record yet.")).toBeInTheDocument();
    expect(screen.getByText("No rental progress yet.")).toBeInTheDocument();
  });
});
