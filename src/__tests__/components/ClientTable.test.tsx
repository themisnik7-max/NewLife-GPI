import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("renders a visible View button per client row", () => {
    render(<ClientTable />);

    const viewButtons = screen.getAllByRole("button", { name: "View" });
    expect(viewButtons).toHaveLength(MOCK_CLIENTS.length);
    viewButtons.forEach((button) => expect(button).toBeVisible());
  });

  it("calls onViewClient with the correct client id when its View button is clicked", async () => {
    const user = userEvent.setup();
    const onViewClient = vi.fn();
    render(<ClientTable onViewClient={onViewClient} />);

    const secondClient = MOCK_CLIENTS[1];
    const viewButtons = screen.getAllByRole("button", { name: "View" });
    await user.click(viewButtons[1]);

    expect(onViewClient).toHaveBeenCalledWith(secondClient.id);
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
