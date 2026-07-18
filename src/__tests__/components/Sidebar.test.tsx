import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar, SIDEBAR_NAV_ITEMS } from "@/components/ui/Sidebar";

const client = { initials: "MP", name: "Maria Papadopoulos", property: "Villa Elytra" };

describe("Sidebar", () => {
  it("renders the brand mark and current client identity", () => {
    render(<Sidebar activeKey="overview" client={client} />);

    expect(screen.getByText("NewLife GPI")).toBeInTheDocument();
    expect(screen.getByText("Maria Papadopoulos")).toBeInTheDocument();
    expect(screen.getByText("Villa Elytra")).toBeInTheDocument();
    expect(screen.getByText("MP")).toBeInTheDocument();
  });

  it("renders every nav item as a visible, clickable button", () => {
    render(<Sidebar activeKey="overview" client={client} />);

    for (const item of SIDEBAR_NAV_ITEMS) {
      expect(screen.getByRole("button", { name: item.label })).toBeVisible();
    }
  });

  it("marks the active nav item and calls onNavigate with its key when another is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<Sidebar activeKey="overview" client={client} onNavigate={onNavigate} />);

    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Payments & expenses" }));
    expect(onNavigate).toHaveBeenCalledWith("payments");
  });

  it("shows a visible log out control and invokes onLogout when clicked", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(<Sidebar activeKey="overview" client={client} onLogout={onLogout} />);

    const logoutButton = screen.getByRole("button", { name: "Log out" });
    expect(logoutButton).toBeVisible();

    await user.click(logoutButton);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
