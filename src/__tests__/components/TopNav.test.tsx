import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "@/components/ui/TopNav";
import type { NotificationEntry } from "@/lib/data/notifications";

const NOTIFICATIONS: NotificationEntry[] = [
  { id: "notif-1", message: "Welcome to NewLife GPI!", read: false, createdAt: "2026-02-01T10:30:00.000Z" },
  { id: "notif-2", message: "Payment of €15,000 recorded.", read: true, createdAt: "2026-01-15T08:00:00.000Z" },
];

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

  it("shows a visible notifications button with an unread count badge, counting only unread ones", () => {
    render(
      <TopNav title="Overview" userName="Maria Papadopoulos" userInitials="MP" notifications={NOTIFICATIONS} />
    );

    const bell = screen.getByRole("button", { name: "Notifications (1 unread)" });
    expect(bell).toBeVisible();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("caps the badge at '9+' rather than showing the exact count once unread exceeds 9", () => {
    const manyUnread: NotificationEntry[] = Array.from({ length: 12 }, (_, index) => ({
      id: `notif-${index}`,
      message: `Notification ${index}`,
      read: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    render(<TopNav title="Overview" userName="Maria Papadopoulos" userInitials="MP" notifications={manyUnread} />);

    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("omits the unread badge when there are no unread notifications", () => {
    render(<TopNav title="Overview" userName="Maria Papadopoulos" userInitials="MP" notifications={[]} />);

    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("opens a dropdown listing every notification when the bell is clicked", async () => {
    const user = userEvent.setup();
    render(
      <TopNav title="Overview" userName="Maria Papadopoulos" userInitials="MP" notifications={NOTIFICATIONS} />
    );

    expect(screen.queryByText("Welcome to NewLife GPI!")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Notifications (1 unread)" }));

    expect(screen.getByText("Welcome to NewLife GPI!")).toBeVisible();
    expect(screen.getByText("Payment of €15,000 recorded.")).toBeVisible();
  });

  it("shows a 'no notifications yet' message when the list is empty and opened", async () => {
    const user = userEvent.setup();
    render(<TopNav title="Overview" userName="Maria Papadopoulos" userInitials="MP" notifications={[]} />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(screen.getByText("No notifications yet.")).toBeVisible();
  });

  it("shows a 'Mark as read' action only for unread notifications, and calls onMarkNotificationRead with its id", async () => {
    const user = userEvent.setup();
    const onMarkNotificationRead = vi.fn();
    render(
      <TopNav
        title="Overview"
        userName="Maria Papadopoulos"
        userInitials="MP"
        notifications={NOTIFICATIONS}
        onMarkNotificationRead={onMarkNotificationRead}
      />
    );

    await user.click(screen.getByRole("button", { name: "Notifications (1 unread)" }));

    const markReadButtons = screen.getAllByRole("button", { name: "Mark as read" });
    expect(markReadButtons).toHaveLength(1);

    await user.click(markReadButtons[0]);
    expect(onMarkNotificationRead).toHaveBeenCalledWith("notif-1");
  });

  it("links the user name and initials to the profile settings page", () => {
    render(<TopNav title="Overview" userName="Maria Papadopoulos" userInitials="MP" />);

    const profileLink = screen.getByRole("link", { name: /Maria Papadopoulos/ });
    expect(profileLink).toHaveAttribute("href", "/settings");
    expect(profileLink).toHaveTextContent("MP");
  });
});
