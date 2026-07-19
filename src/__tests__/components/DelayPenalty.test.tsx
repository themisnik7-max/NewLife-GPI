import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DelayPenalty } from "@/components/ui/DelayPenalty";

describe("DelayPenalty", () => {
  it("shows the red warning banner with the localized currency amount when delayed", () => {
    render(<DelayPenalty isDelayed penaltyAmount={1250} />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveClass("bg-red-50");
    expect(banner).toHaveClass("text-red-700");
    expect(screen.getByText("€1,250.00")).toBeInTheDocument();
  });

  it("hides the warning and shows a green success panel when not delayed", () => {
    render(<DelayPenalty isDelayed={false} penaltyAmount={1250} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const panel = screen.getByRole("status");
    expect(panel).toHaveClass("bg-green-50");
    expect(panel).toHaveClass("text-green-700");
    expect(screen.getByText("On schedule")).toBeInTheDocument();
  });
});
