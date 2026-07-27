import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AdminPaymentsTable } from "@/components/ui/AdminPaymentsTable";
import type { TenantPaymentsOverview } from "@/lib/data/ledgers";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "ledger-1",
    propertyId: "property-1",
    userId: "user_1",
    amount: 1000,
    amountPaid: 400,
    dueDate: "2026-09-01",
    status: "PENDING" as const,
    isDelayed: false,
    penaltyAmount: 0,
    clientName: "Maria Papadopoulos",
    clientEmail: "maria@example.com",
    propertyName: "Villa Elytra",
    outstanding: 600,
    ...overrides,
  };
}

function overview(overrides: Partial<TenantPaymentsOverview> = {}): TenantPaymentsOverview {
  return {
    entries: [entry()],
    totals: { billed: 1000, collected: 400, outstanding: 600, overdueCount: 0 },
    ...overrides,
  } as TenantPaymentsOverview;
}

describe("AdminPaymentsTable", () => {
  it("renders each installment with its client and property", () => {
    render(<AdminPaymentsTable overview={overview()} />);

    expect(screen.getByText("Maria Papadopoulos")).toBeVisible();
    expect(screen.getByText("Villa Elytra")).toBeVisible();
    expect(screen.getByText("1 Sept 2026")).toBeVisible();
  });

  it("links the client to their profile", () => {
    render(<AdminPaymentsTable overview={overview()} />);

    expect(screen.getByRole("link", { name: "Maria Papadopoulos" })).toHaveAttribute(
      "href",
      "/dashboard/clients/user_1",
    );
  });

  it("labels status in words, never by colour alone", () => {
    render(<AdminPaymentsTable overview={overview()} />);

    expect(screen.getByText("Pending")).toBeVisible();
  });

  it("shows Overdue in preference to Pending, because it is the actionable fact", () => {
    // A row can be PENDING and overdue at once — delay is computed from the
    // clock, not stored on the row.
    render(
      <AdminPaymentsTable
        overview={overview({
          entries: [entry({ isDelayed: true })],
          totals: { billed: 1000, collected: 400, outstanding: 600, overdueCount: 1 },
        })}
      />,
    );

    expect(screen.getByText("Overdue")).toBeVisible();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  it("labels a settled installment as Paid", () => {
    render(
      <AdminPaymentsTable
        overview={overview({ entries: [entry({ status: "PAID", amountPaid: 1000, outstanding: 0 })] })}
      />,
    );

    expect(screen.getByText("Paid")).toBeVisible();
  });

  it("surfaces a penalty amount alongside the status", () => {
    render(<AdminPaymentsTable overview={overview({ entries: [entry({ isDelayed: true, penaltyAmount: 250 })] })} />);

    expect(screen.getByText("+€250.00 penalty")).toBeVisible();
  });

  it("hides the penalty line when there is none", () => {
    render(<AdminPaymentsTable overview={overview()} />);

    expect(screen.queryByText(/penalty/)).not.toBeInTheDocument();
  });

  it("footers the totals so the column of numbers adds up", () => {
    render(<AdminPaymentsTable overview={overview()} />);

    const footer = screen.getByRole("row", { name: /1 installment/ });
    expect(within(footer).getByText("€1,000.00")).toBeVisible();
    expect(within(footer).getByText("€600.00")).toBeVisible();
  });

  it("pluralises the footer count", () => {
    render(
      <AdminPaymentsTable
        overview={overview({
          entries: [entry(), entry({ id: "ledger-2" })],
          totals: { billed: 2000, collected: 800, outstanding: 1200, overdueCount: 0 },
        })}
      />,
    );

    expect(screen.getByText("2 installments")).toBeVisible();
  });

  it("names the overdue count in the footer", () => {
    render(
      <AdminPaymentsTable
        overview={overview({ totals: { billed: 1000, collected: 400, outstanding: 600, overdueCount: 2 } })}
      />,
    );

    expect(screen.getByText("2 overdue")).toBeVisible();
  });

  it("says none are overdue rather than leaving the cell blank", () => {
    render(<AdminPaymentsTable overview={overview()} />);

    expect(screen.getByText("None overdue")).toBeVisible();
  });

  it("explains where installments come from instead of rendering an empty table", () => {
    render(
      <AdminPaymentsTable
        overview={overview({ entries: [], totals: { billed: 0, collected: 0, outstanding: 0, overdueCount: 0 } })}
      />,
    );

    expect(screen.getByText(/No payment installments have been created yet/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
