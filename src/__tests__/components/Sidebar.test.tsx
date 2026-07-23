import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar, SIDEBAR_NAV_ITEMS } from "@/components/ui/Sidebar";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

const client = { property: "Villa Elytra" };

describe("Sidebar", () => {
  it("renders the brand mark and the current client's property", () => {
    render(<Sidebar activeKey="overview" client={client} />);

    expect(screen.getByText("NewLife GPI")).toBeInTheDocument();
    expect(screen.getByText("Villa Elytra")).toBeInTheDocument();
  });

  it("renders every non-admin-only nav item as a visible link pointing at its route", () => {
    render(<Sidebar activeKey="overview" client={client} />);

    for (const item of SIDEBAR_NAV_ITEMS.filter((navItem) => !navItem.adminOnly)) {
      const link = screen.getByRole("link", { name: item.label });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute("href", item.href);
    }
  });

  it("hides admin-only nav items (Team) when isAdmin is not passed", () => {
    render(<Sidebar activeKey="overview" client={client} />);

    expect(screen.queryByRole("link", { name: "Team" })).not.toBeInTheDocument();
  });

  it("shows admin-only nav items (Team) when isAdmin is true", () => {
    render(<Sidebar activeKey="overview" client={client} isAdmin />);

    const link = screen.getByRole("link", { name: "Team" });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute("href", "/dashboard/team");
  });

  it("marks only the active nav item with aria-current", () => {
    render(<Sidebar activeKey="payments" client={client} />);

    expect(screen.getByRole("link", { name: "Payments & expenses" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("renders Clerk's UserButton", () => {
    // afterSignOutUrl is no longer passed here — it moved to <ClerkProvider>
    // in src/app/layout.tsx (deprecated on UserButton itself; see the
    // comment at its call site in Sidebar.tsx).
    render(<Sidebar activeKey="overview" client={client} />);

    expect(screen.getByTestId("user-button")).toBeVisible();
  });
});
