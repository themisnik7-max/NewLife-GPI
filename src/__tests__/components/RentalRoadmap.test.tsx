import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useUser } from "@clerk/nextjs";
import { RentalRoadmap, RENTAL_STAGES } from "@/components/ui/RentalRoadmap";

vi.mock("@clerk/nextjs", () => ({
  useUser: vi.fn(),
}));

const mockedUseUser = vi.mocked(useUser);

function mockRentalStageIndex(rentalStageIndex: number | undefined) {
  mockedUseUser.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    user: { publicMetadata: { rentalStageIndex } },
  } as unknown as ReturnType<typeof useUser>);
}

describe("RentalRoadmap", () => {
  it("renders all 10 stages in order", () => {
    mockRentalStageIndex(0);
    render(<RentalRoadmap />);

    for (const stage of RENTAL_STAGES) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
  });

  it("marks exactly 4 steps completed, the 5th active with pulsing structural styling, and the rest pending when rentalStageIndex is 4", () => {
    mockRentalStageIndex(4);
    render(<RentalRoadmap />);

    expect(screen.getAllByText("Completed")).toHaveLength(4);
    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(screen.getAllByText("Pending")).toHaveLength(5);

    const activeStepItem = screen.getByText(RENTAL_STAGES[4]).closest("li");
    expect(activeStepItem).toHaveAttribute("aria-current", "step");

    const activeIndicator = activeStepItem?.querySelector(".animate-pulse");
    expect(activeIndicator).not.toBeNull();
    expect(activeIndicator).toHaveClass("bg-blue-500");

    const completedStepItem = screen.getByText(RENTAL_STAGES[0]).closest("li");
    expect(completedStepItem).not.toHaveAttribute("aria-current");
    expect(completedStepItem?.querySelector(".bg-green-500")).not.toBeNull();

    const pendingStepItem = screen.getByText(RENTAL_STAGES[9]).closest("li");
    expect(pendingStepItem).not.toHaveAttribute("aria-current");
    expect(pendingStepItem?.querySelector(".bg-gray-200")).not.toBeNull();
  });

  it("defaults to index 0 when rentalStageIndex is missing from publicMetadata", () => {
    mockRentalStageIndex(undefined);
    render(<RentalRoadmap />);

    expect(screen.queryAllByText("Completed")).toHaveLength(0);
    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(screen.getByText(RENTAL_STAGES[0]).closest("li")).toHaveAttribute("aria-current", "step");
  });
});
