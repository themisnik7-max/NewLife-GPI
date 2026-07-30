import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpenTasksPanel } from "@/components/ui/OpenTasksPanel";
import type { ActivityView } from "@/lib/activities";

function makeTask(overrides: Partial<ActivityView> = {}): ActivityView {
  return {
    id: "t1",
    entityType: "User",
    entityId: "user_client1",
    type: "TASK",
    typeLabel: "Task",
    subject: "Chase the energy certificate",
    body: null,
    occurredAt: null,
    dueAt: "2099-01-01T00:00:00.000Z",
    completedAt: null,
    visibleToClient: false,
    createdByUserId: "user_admin",
    createdByName: "Themis",
    createdAt: "2026-07-23T09:00:00.000Z",
    ...overrides,
  };
}

describe("OpenTasksPanel", () => {
  it("says nothing is outstanding rather than rendering an empty list", () => {
    render(<OpenTasksPanel tasks={[]} />);

    expect(screen.getByText("Nothing outstanding.")).toBeInTheDocument();
  });

  it("counts the tasks", () => {
    render(<OpenTasksPanel tasks={[makeTask(), makeTask({ id: "t2", subject: "Call the notary" })]} />);

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("computes overdue against the clock, not a stored flag", () => {
    // A task becomes overdue the moment its due date passes — no batch job
    // needed to flip a column first.
    render(
      <OpenTasksPanel
        tasks={[makeTask({ dueAt: "2020-01-01T00:00:00.000Z" }), makeTask({ id: "t2" })]}
      />,
    );

    expect(screen.getByText("1 overdue")).toBeInTheDocument();
    expect(screen.getByText(/Was due/)).toBeInTheDocument();
  });

  it("shows no overdue badge when everything is on time", () => {
    render(<OpenTasksPanel tasks={[makeTask()]} />);

    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Due/)).toBeInTheDocument();
  });

  it("links a task to the record it belongs to", () => {
    render(<OpenTasksPanel tasks={[makeTask({ entityType: "User", entityId: "user_x" })]} />);

    expect(screen.getByRole("link", { name: "Chase the energy certificate" })).toHaveAttribute(
      "href",
      "/dashboard/clients/user_x",
    );
  });

  it("routes a property task to the property page", () => {
    render(<OpenTasksPanel tasks={[makeTask({ entityType: "Property", entityId: "prop-1" })]} />);

    expect(screen.getByRole("link", { name: /Chase/ })).toHaveAttribute(
      "href",
      "/dashboard/projects/prop-1",
    );
  });

  it("renders plain text rather than a dead link for an unroutable entity type", () => {
    render(<OpenTasksPanel tasks={[makeTask({ entityType: "Mystery", entityId: "x" })]} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Chase the energy certificate")).toBeInTheDocument();
  });

  it("offers no completion control — that belongs on the record, with its context", () => {
    render(<OpenTasksPanel tasks={[makeTask()]} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
