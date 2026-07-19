import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("renders every nav item as a visible link pointing at its route", () => {
    render(<Sidebar activeKey="overview" client={client} />);

    for (const item of SIDEBAR_NAV_ITEMS) {
      const link = screen.getByRole("link", { name: item.label });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute("href", item.href);
    }
  });

  it("marks only the active nav item with aria-current", () => {
    render(<Sidebar activeKey="payments" client={client} />);

    expect(screen.getByRole("link", { name: "Payments & expenses" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("renders Clerk's UserButton wired to redirect to / after sign-out", () => {
    render(<Sidebar activeKey="overview" client={client} />);

    const userButton = screen.getByTestId("user-button");
    expect(userButton).toBeVisible();
    expect(userButton).toHaveAttribute("data-after-sign-out-url", "/");
  });
});
