import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MetricsDashboard } from "@/components/ui/MetricsDashboard";
import type { TenantMetrics } from "@/lib/data/metrics";

function metrics(overrides: Partial<TenantMetrics> = {}): TenantMetrics {
  return {
    clients: { total: 4, withProperty: 3 },
    properties: { total: 6, sold: 2, availableUnits: 11, listedForRental: 2 },
    sales: { valueRecorded: 850000, missingPrice: 0 },
    payments: { billed: 100000, collected: 40000, outstanding: 60000, overdueCount: 0 },
    visa: { clientsInProgress: 3, stepsCompleted: 5, stepsTotal: 10 },
    rentals: { unitsListed: 2, clientsInProgress: 1, stagesCompleted: 4, stagesTotal: 20 },
    ...overrides,
  };
}

describe("MetricsDashboard", () => {
  it("renders each headline figure", () => {
    render(<MetricsDashboard metrics={metrics()} />);

    expect(screen.getByText("4")).toBeVisible();
    // The outstanding figure appears twice by design — once as a headline
    // card and once in the payments breakdown — so this asserts on the card.
    const card = screen.getByRole("link", { name: /Outstanding/ });
    expect(within(card).getByText("€60,000")).toBeVisible();
  });

  it("links each card to the page that owns its detail", () => {
    render(<MetricsDashboard metrics={metrics()} />);

    expect(screen.getByRole("link", { name: /Clients/ })).toHaveAttribute("href", "/dashboard/clients");
    expect(screen.getByRole("link", { name: /Properties sold/ })).toHaveAttribute(
      "href",
      "/dashboard/property",
    );
    expect(screen.getByRole("link", { name: /Outstanding/ })).toHaveAttribute("href", "/dashboard/payments");
  });

  it("names the overdue count when there is one", () => {
    render(<MetricsDashboard metrics={metrics({ payments: { billed: 1, collected: 0, outstanding: 1, overdueCount: 3 } })} />);

    expect(screen.getByText("3 installments overdue")).toBeVisible();
  });

  it("says nothing is overdue rather than showing a bare zero", () => {
    render(<MetricsDashboard metrics={metrics()} />);

    expect(screen.getByText("Nothing overdue")).toBeVisible();
  });

  it("singularises a single overdue installment", () => {
    render(<MetricsDashboard metrics={metrics({ payments: { billed: 1, collected: 0, outstanding: 1, overdueCount: 1 } })} />);

    expect(screen.getByText("1 installment overdue")).toBeVisible();
  });

  it("shows how incomplete the recorded sales value is, next to the value itself", () => {
    // A portfolio total computed from partial data is misleading unless its
    // incompleteness is equally visible.
    render(<MetricsDashboard metrics={metrics({ sales: { valueRecorded: 850000, missingPrice: 2 } })} />);

    expect(screen.getByText("Excludes 2 sales with no price on file.")).toBeVisible();
  });

  it("singularises a single missing sale price", () => {
    render(<MetricsDashboard metrics={metrics({ sales: { valueRecorded: 1, missingPrice: 1 } })} />);

    expect(screen.getByText("Excludes 1 sale with no price on file.")).toBeVisible();
  });

  it("singularises the workflow labels for a single client and a single unit", () => {
    render(
      <MetricsDashboard
        metrics={metrics({
          visa: { clientsInProgress: 1, stepsCompleted: 1, stepsTotal: 2 },
          rentals: { unitsListed: 1, clientsInProgress: 1, stagesCompleted: 1, stagesTotal: 10 },
        })}
      />,
    );

    expect(screen.getByRole("progressbar", { name: "Golden Visa · 1 client" })).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Lettings · 1 unit" })).toBeVisible();
  });

  it("confirms completeness when every sale has a price", () => {
    render(<MetricsDashboard metrics={metrics()} />);

    expect(screen.getByText("Every recorded sale has a price on file.")).toBeVisible();
  });

  it("exposes workflow progress as accessible progressbars with a percentage", () => {
    render(<MetricsDashboard metrics={metrics()} />);

    const visa = screen.getByRole("progressbar", { name: /Golden Visa/ });
    expect(visa).toHaveAttribute("aria-valuenow", "50");
  });

  it("renders zero progress rather than dividing by zero when nothing exists yet", () => {
    render(
      <MetricsDashboard
        metrics={metrics({
          visa: { clientsInProgress: 0, stepsCompleted: 0, stepsTotal: 0 },
          rentals: { unitsListed: 0, clientsInProgress: 0, stagesCompleted: 0, stagesTotal: 0 },
        })}
      />,
    );

    expect(screen.getByRole("progressbar", { name: /Golden Visa/ })).toHaveAttribute("aria-valuenow", "0");
  });

  it("breaks payments into billed, collected and outstanding", () => {
    render(<MetricsDashboard metrics={metrics()} />);

    const section = screen.getByRole("heading", { name: "Payments" }).closest("section")!;
    expect(within(section).getByText("€100,000")).toBeVisible();
    expect(within(section).getByText("€40,000")).toBeVisible();
  });
});
