import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConstructionMilestones } from "@/components/ui/ConstructionMilestones";
import type { MilestoneEntry } from "@/lib/data/construction";

const MILESTONES: MilestoneEntry[] = [
  {
    id: "milestone-1",
    propertyId: "property-1",
    title: "Foundation poured",
    description: "Site foundation work completed and inspected.",
    status: "COMPLETED",
    targetDate: "2026-09-01",
    completionDate: "2026-09-05",
  },
  {
    id: "milestone-2",
    propertyId: "property-1",
    title: "Roofing",
    description: null,
    status: "IN_PROGRESS",
    targetDate: "2026-11-01",
    completionDate: null,
  },
  {
    id: "milestone-3",
    propertyId: "property-1",
    title: "Interior finishing",
    description: null,
    status: "PENDING",
    targetDate: "2027-01-15",
    completionDate: null,
  },
];

describe("ConstructionMilestones", () => {
  it("renders overall progress from the real count of completed milestones, not a fabricated percentage", () => {
    render(<ConstructionMilestones milestones={MILESTONES} />);

    expect(screen.getByText("1 of 3 milestones complete")).toBeInTheDocument();
  });

  it("renders every milestone's title and status label", () => {
    render(<ConstructionMilestones milestones={MILESTONES} />);

    expect(screen.getByText("Foundation poured")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Roofing")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Interior finishing")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows the completion date for a completed milestone and the target date for one that is not complete yet", () => {
    render(<ConstructionMilestones milestones={MILESTONES} />);

    // en-GB's short month form for September is "Sept" (4 letters) — every
    // other month abbreviates to 3, confirmed directly against Intl before
    // writing this assertion rather than assumed.
    expect(screen.getByText("Completed 5 Sept 2026")).toBeInTheDocument();
    expect(screen.getByText("Target 1 Nov 2026")).toBeInTheDocument();
  });

  it("renders a milestone's description when present and leaks no literal 'null' text when it is absent", () => {
    render(<ConstructionMilestones milestones={MILESTONES} />);

    expect(screen.getByText("Site foundation work completed and inspected.")).toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("renders 0 of 0 without crashing when there are no milestones yet", () => {
    render(<ConstructionMilestones milestones={[]} />);

    expect(screen.getByText("0 of 0 milestones complete")).toBeInTheDocument();
  });
});
