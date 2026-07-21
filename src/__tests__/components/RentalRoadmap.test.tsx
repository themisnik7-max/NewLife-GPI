import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RentalRoadmap, RENTAL_STAGES } from "@/components/ui/RentalRoadmap";

describe("RentalRoadmap", () => {
  it("renders all 10 stages in order", () => {
    render(<RentalRoadmap currentStage="RESERVATION" />);

    for (const { label } of RENTAL_STAGES) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks exactly 4 stages completed, the 5th active with pulsing structural styling, and the rest pending when currentStage is VISA_SUBMISSION", () => {
    render(<RentalRoadmap currentStage="VISA_SUBMISSION" />);

    expect(screen.getAllByText("Completed")).toHaveLength(4);
    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(screen.getAllByText("Pending")).toHaveLength(5);

    const activeStepItem = screen.getByText(RENTAL_STAGES[4].label).closest("li");
    expect(activeStepItem).toHaveAttribute("aria-current", "step");

    const activeIndicator = activeStepItem?.querySelector(".animate-pulse");
    expect(activeIndicator).not.toBeNull();
    expect(activeIndicator).toHaveClass("bg-blue-500");

    const completedStepItem = screen.getByText(RENTAL_STAGES[0].label).closest("li");
    expect(completedStepItem).not.toHaveAttribute("aria-current");
    expect(completedStepItem?.querySelector(".bg-green-500")).not.toBeNull();

    const pendingStepItem = screen.getByText(RENTAL_STAGES[9].label).closest("li");
    expect(pendingStepItem).not.toHaveAttribute("aria-current");
    expect(pendingStepItem?.querySelector(".bg-gray-200")).not.toBeNull();
  });

  it("treats the very first stage (RESERVATION) as active with nothing completed yet", () => {
    render(<RentalRoadmap currentStage="RESERVATION" />);

    expect(screen.queryAllByText("Completed")).toHaveLength(0);
    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(screen.getByText(RENTAL_STAGES[0].label).closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("marks every stage completed when currentStage is the final stage (RENTAL_ACTIVE)", () => {
    render(<RentalRoadmap currentStage="RENTAL_ACTIVE" />);

    expect(screen.getAllByText("Completed")).toHaveLength(9);
    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(screen.queryAllByText("Pending")).toHaveLength(0);
  });
});
