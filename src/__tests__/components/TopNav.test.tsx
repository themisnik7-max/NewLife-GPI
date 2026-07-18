import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "@/components/ui/TopNav";

describe("TopNav", () => {
  it("renders the title, subtitle, and user identity", () => {
    render(
      <TopNav
        title="Overview"
        subtitle="Here's where things stand today."
        userName="Maria Papadopoulos"
        userInitials="MP"
      />
    );

    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Here's where things stand today.")).toBeInTheDocument();
    expect(screen.getByText("Maria Papadopoulos")).toBeInTheDocument();
    expect(screen.getByText("MP")).toBeInTheDocument();
  });

  it("shows a visible, editable search input", async () => {
    const user = userEvent.setup();
    render(<TopNav title="Overview" userName="Maria Papadopoulos" userInitials="MP" />);

    const search = screen.getByPlaceholderText("Search clients, properties…");
    expect(search).toBeVisible();

    await user.type(search, "Villa Elytra");
    expect(search).toHaveValue("Villa Elytra");
  });

  it("shows a visible notifications button with an unread count badge", () => {
    render(
      <TopNav title="Overview" userName="Maria Papadopoulos" userInitials="MP" notificationCount={3} />
    );

    const bell = screen.getByRole("button", { name: "Notifications (3 unread)" });
    expect(bell).toBeVisible();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("omits the unread badge when there are no notifications", () => {
    render(<TopNav title="Overview" userName="Maria Papadopoulos" userInitials="MP" notificationCount={0} />);

    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });
});
