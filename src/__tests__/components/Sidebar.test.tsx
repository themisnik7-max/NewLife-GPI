import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar, SIDEBAR_NAV_ITEMS } from "@/components/ui/Sidebar";

vi.mock("@clerk/nextjs", () => ({
  UserButton: (props: { afterSignOutUrl?: string }) => (
    <div data-testid="user-button" data-after-sign-out-url={props.afterSignOutUrl} />
  ),
}));

const client = { property: "Villa Elytra" };

describe("Sidebar", () => {
  it("renders the brand mark and the current client's property", () => {
    render(<Sidebar activeKey="overview" client={client} />);

    expect(screen.getByText("NewLife GPI")).toBeInTheDocument();
    expect(screen.getByText("Villa Elytra")).toBeInTheDocument();
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

  it("renders Clerk's UserButton wired to redirect to / after sign-out", () => {
    render(<Sidebar activeKey="overview" client={client} />);

    const userButton = screen.getByTestId("user-button");
    expect(userButton).toBeVisible();
    expect(userButton).toHaveAttribute("data-after-sign-out-url", "/");
  });
});
