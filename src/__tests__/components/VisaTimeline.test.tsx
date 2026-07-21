import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VisaTimeline } from "@/components/ui/VisaTimeline";
import type { VisaStepEntry } from "@/lib/data/visa";

const STEPS: VisaStepEntry[] = [
  {
    id: "step-1",
    stepOrder: 1,
    title: "Submit application",
    description: "Initial Golden Visa application package submitted to the ministry.",
    status: "COMPLETED",
    completedAt: "2026-02-01T10:30:00.000Z",
  },
  {
    id: "step-2",
    stepOrder: 2,
    title: "Legal review",
    description: null,
    status: "IN_PROGRESS",
    completedAt: null,
  },
  {
    id: "step-3",
    stepOrder: 3,
    title: "Biometrics appointment",
    description: null,
    status: "PENDING",
    completedAt: null,
  },
];

describe("VisaTimeline", () => {
  it("renders every step's order number, title, and status label", () => {
    render(<VisaTimeline steps={STEPS} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Submit application")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Legal review")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Biometrics appointment")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
  });

  it("marks only the in-progress step as the current aria step", () => {
    render(<VisaTimeline steps={STEPS} />);

    expect(screen.getByText("Legal review").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Submit application").closest("li")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Biometrics appointment").closest("li")).not.toHaveAttribute("aria-current");
  });

  it("shows a completed step's completion date and its description", () => {
    render(<VisaTimeline steps={STEPS} />);

    expect(screen.getByText("Completed 1 Feb 2026")).toBeInTheDocument();
    expect(
      screen.getByText("Initial Golden Visa application package submitted to the ministry."),
    ).toBeInTheDocument();
  });

  it("omits the completion date and description entirely for a step that has neither, rather than rendering null", () => {
    render(<VisaTimeline steps={STEPS} />);

    const legalReviewItem = screen.getByText("Legal review").closest("li");
    expect(legalReviewItem?.textContent).not.toContain("Completed");
    expect(legalReviewItem?.textContent).not.toContain("null");
  });

  it("does not render a connector line after the last step", () => {
    const { container } = render(<VisaTimeline steps={STEPS} />);

    // aria-hidden="true" is only ever used on the connector line between
    // steps in this component, so this count doubles as a direct check that
    // there is exactly one fewer connector than there are steps.
    const connectors = container.querySelectorAll('span[aria-hidden="true"]');
    expect(connectors).toHaveLength(STEPS.length - 1);
  });
});
