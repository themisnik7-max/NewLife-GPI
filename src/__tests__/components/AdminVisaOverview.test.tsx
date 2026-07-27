import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminVisaOverview } from "@/components/ui/AdminVisaOverview";
import type { ClientVisaJourney } from "@/lib/data/visa";

function step(overrides: Record<string, unknown> = {}) {
  return {
    id: "step-1",
    stepOrder: 1,
    title: "Application submitted",
    description: null,
    status: "COMPLETED" as const,
    completedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function journey(overrides: Partial<ClientVisaJourney> = {}): ClientVisaJourney {
  return {
    userId: "user_1",
    name: "Maria Papadopoulos",
    email: "maria@example.com",
    steps: [step()],
    completed: 1,
    total: 1,
    ...overrides,
  } as ClientVisaJourney;
}

describe("AdminVisaOverview", () => {
  it("renders one section per client with their step count", () => {
    render(<AdminVisaOverview journeys={[journey()]} />);

    expect(screen.getByText("Maria Papadopoulos")).toBeVisible();
    expect(screen.getByText("1 of 1 steps")).toBeVisible();
  });

  it("links the client's name to their profile", () => {
    render(<AdminVisaOverview journeys={[journey()]} />);

    expect(screen.getByRole("link", { name: "Maria Papadopoulos" })).toHaveAttribute(
      "href",
      "/dashboard/clients/user_1",
    );
  });

  it("renders every step as a labelled pill", () => {
    render(
      <AdminVisaOverview
        journeys={[
          journey({
            steps: [step(), step({ id: "s2", stepOrder: 2, title: "Biometrics", status: "PENDING", completedAt: null })],
            completed: 1,
            total: 2,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Application submitted")).toBeVisible();
    expect(screen.getByText("Biometrics")).toBeVisible();
  });

  it("keeps the completion date reachable without swamping the row", () => {
    render(<AdminVisaOverview journeys={[journey()]} />);

    expect(screen.getByText("Application submitted")).toHaveAttribute("title", "Completed 1 Apr 2026");
  });

  it("falls back to the status in the tooltip when a step is not complete", () => {
    render(
      <AdminVisaOverview
        journeys={[journey({ steps: [step({ status: "IN_PROGRESS", completedAt: null })], completed: 0 })]}
      />,
    );

    expect(screen.getByText("Application submitted")).toHaveAttribute("title", "IN_PROGRESS");
  });

  it("shows a client whose application has not been started, rather than hiding them", () => {
    // A supervisor most needs to see the applications nobody has begun.
    render(<AdminVisaOverview journeys={[journey({ steps: [], completed: 0, total: 0 })]} />);

    expect(screen.getByText("Not started")).toBeVisible();
    expect(screen.getByText(/No application steps have been created/)).toBeVisible();
  });

  it("explains the empty state when the tenant has no clients at all", () => {
    render(<AdminVisaOverview journeys={[]} />);

    expect(screen.getByText(/No clients yet/)).toBeVisible();
  });
});
