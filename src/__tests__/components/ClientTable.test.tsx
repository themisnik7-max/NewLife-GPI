import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ClientTable, MOCK_CLIENTS } from "@/components/ui/ClientTable";

describe("ClientTable", () => {
  it("renders every mock client's name, email, property, status, and joined date", () => {
    render(<ClientTable />);

    for (const client of MOCK_CLIENTS) {
      // Scoped to this client's own row: several mock clients intentionally
      // share the same status label (e.g. "Active"), so an unscoped
      // getByText would match more than one element.
      const row = screen.getByText(client.name).closest("tr");
      expect(row).not.toBeNull();
      const withinRow = within(row as HTMLElement);

      expect(withinRow.getByText(client.email)).toBeInTheDocument();
      expect(withinRow.getByText(client.property)).toBeInTheDocument();
      expect(withinRow.getByText(client.status)).toBeInTheDocument();
      expect(withinRow.getByText(client.joinedDate)).toBeInTheDocument();
    }
  });

  it("links each client's View action to their admin detail page", () => {
    render(<ClientTable />);

    for (const client of MOCK_CLIENTS) {
      const row = screen.getByText(client.name).closest("tr");
      const viewLink = within(row as HTMLElement).getByRole("link", { name: "View" });
      expect(viewLink).toHaveAttribute("href", `/dashboard/clients/${client.id}`);
    }
  });

  it("renders a custom client list instead of the mock data when provided", () => {
    const custom = [
      {
        id: "c_test",
        name: "Test Client",
        email: "test@example.com",
        property: "Test Property",
        status: "Active" as const,
        joinedDate: "1 Jan 2026",
      },
    ];
    render(<ClientTable clients={custom} />);

    expect(screen.getByText("Test Client")).toBeInTheDocument();
    expect(screen.queryByText(MOCK_CLIENTS[0].name)).not.toBeInTheDocument();
  });
});
