import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityTimeline } from "@/components/ui/ActivityTimeline";
import type { ActivityView, TimelineEntry } from "@/lib/activities";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("@/app/dashboard/activities/actions", () => ({
  createActivityAction: vi.fn(),
  updateActivityAction: vi.fn(),
  setTaskCompletionAction: vi.fn(),
  deleteActivityAction: vi.fn(),
}));

import {
  createActivityAction,
  deleteActivityAction,
  setTaskCompletionAction,
  updateActivityAction,
} from "@/app/dashboard/activities/actions";

const mockedCreate = vi.mocked(createActivityAction);
const mockedUpdate = vi.mocked(updateActivityAction);
const mockedSetTask = vi.mocked(setTaskCompletionAction);
const mockedDelete = vi.mocked(deleteActivityAction);

const USER_1 = "user_client1";

function makeActivity(overrides: Partial<ActivityView> = {}): ActivityView {
  return {
    id: "a1",
    entityType: "User",
    entityId: USER_1,
    type: "CALL",
    typeLabel: "Call",
    subject: "Discussed the offer",
    body: null,
    occurredAt: "2026-07-20T09:00:00.000Z",
    dueAt: null,
    completedAt: null,
    visibleToClient: false,
    createdByUserId: "user_admin",
    createdByName: "Themis",
    createdAt: "2026-07-23T09:00:00.000Z",
    ...overrides,
  };
}

function activityEntry(overrides: Partial<ActivityView> = {}): TimelineEntry {
  const activity = makeActivity(overrides);
  return { kind: "activity", at: activity.occurredAt ?? activity.createdAt, activity };
}

const systemEntry: TimelineEntry = {
  kind: "system",
  at: "2026-07-25T09:00:00.000Z",
  id: "s1",
  summary: "changed status from Pending to Done",
  actorName: "Themis",
};

const baseProps = { entityType: "User", entityId: USER_1 };

beforeEach(() => {
  mockRefresh.mockReset();
  mockedCreate.mockReset().mockResolvedValue(undefined);
  mockedUpdate.mockReset().mockResolvedValue(undefined);
  mockedSetTask.mockReset().mockResolvedValue(undefined);
  mockedDelete.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

describe("the merged feed", () => {
  it("renders human activities and system events together", () => {
    render(<ActivityTimeline entries={[systemEntry, activityEntry()]} {...baseProps} />);

    expect(screen.getByText("Discussed the offer")).toBeInTheDocument();
    expect(screen.getByText(/changed status from Pending to Done/)).toBeInTheDocument();
  });

  it("can hide system events, which are context rather than content", async () => {
    const user = userEvent.setup();
    render(<ActivityTimeline entries={[systemEntry, activityEntry()]} {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /Hide system events/ }));

    expect(screen.queryByText(/changed status/)).not.toBeInTheDocument();
    expect(screen.getByText("Discussed the offer")).toBeInTheDocument();
  });

  it("offers no filter toggle when there are no system events to hide", () => {
    render(<ActivityTimeline entries={[activityEntry()]} {...baseProps} />);

    expect(screen.queryByRole("button", { name: /system events/ })).not.toBeInTheDocument();
  });

  it("says so plainly when nothing has been recorded", () => {
    render(<ActivityTimeline entries={[]} {...baseProps} />);

    expect(screen.getByText("Nothing recorded yet.")).toBeInTheDocument();
  });

  it("renders the body when there is one", () => {
    render(
      <ActivityTimeline
        entries={[activityEntry({ body: "Wants to close before September." })]}
        {...baseProps}
      />,
    );

    expect(screen.getByText("Wants to close before September.")).toBeInTheDocument();
  });
});

describe("read-only mode (a client viewing their own record)", () => {
  it("offers no composer", () => {
    render(<ActivityTimeline entries={[activityEntry()]} {...baseProps} />);

    expect(screen.queryByRole("radiogroup", { name: "Activity type" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Log activity/ })).not.toBeInTheDocument();
  });

  it("offers no delete, share or task controls", () => {
    render(
      <ActivityTimeline
        entries={[activityEntry({ type: "TASK", dueAt: "2026-08-01T00:00:00.000Z" })]}
        {...baseProps}
      />,
    );

    expect(screen.queryByLabelText(/Delete/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Share/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Complete/)).not.toBeInTheDocument();
  });

  it("hides the 'Shared' badge, which is admin vocabulary", () => {
    render(<ActivityTimeline entries={[activityEntry({ visibleToClient: true })]} {...baseProps} />);

    expect(screen.queryByText("Shared")).not.toBeInTheDocument();
  });
});

describe("the composer", () => {
  const adminProps = { ...baseProps, canManage: true };

  it("defaults to Note and offers all five types", () => {
    render(<ActivityTimeline entries={[]} {...adminProps} />);

    expect(screen.getByRole("radio", { name: /Note/ })).toBeChecked();
    for (const label of ["Call", "Email", "Meeting", "Note", "Task"]) {
      expect(screen.getByRole("radio", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("asks when it happened for an interaction, and offers back-dating", () => {
    render(<ActivityTimeline entries={[]} {...adminProps} />);

    expect(screen.getByText("When it happened")).toBeInTheDocument();
    expect(screen.getByText(/Back-date it to log something from last week/)).toBeInTheDocument();
    expect(screen.queryByText("Due")).not.toBeInTheDocument();
  });

  it("swaps to a due date when the type is Task", async () => {
    const user = userEvent.setup();
    render(<ActivityTimeline entries={[]} {...adminProps} />);

    await user.click(screen.getByRole("radio", { name: /Task/ }));

    // A task has a due date and no occurrence time; the form never offers
    // the wrong field, so a row carrying both cannot be created here.
    expect(screen.getByText("Due")).toBeInTheDocument();
    expect(screen.queryByText("When it happened")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add task/ })).toBeInTheDocument();
  });

  it("submits a call with its subject and body", async () => {
    const user = userEvent.setup();
    render(<ActivityTimeline entries={[]} {...adminProps} />);

    await user.click(screen.getByRole("radio", { name: /Call/ }));
    await user.type(screen.getByLabelText("Subject"), "Called about the offer");
    await user.type(screen.getByLabelText("Details"), "Wants two more weeks.");
    await user.click(screen.getByRole("button", { name: /Log activity/ }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "User",
          entityId: USER_1,
          type: "CALL",
          subject: "Called about the offer",
          body: "Wants two more weeks.",
          dueAt: null,
        }),
      ),
    );
  });

  it("leaves 'visible to client' unchecked so a forgotten checkbox under-shares", () => {
    render(<ActivityTimeline entries={[]} {...adminProps} />);

    expect(screen.getByRole("checkbox", { name: /Visible to the client/ })).not.toBeChecked();
  });

  it("surfaces a rejected save inline instead of throwing", async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValueOnce(new Error("A task needs a due date."));
    render(<ActivityTimeline entries={[]} {...adminProps} />);

    await user.type(screen.getByLabelText("Subject"), "Something");
    await user.click(screen.getByRole("button", { name: /Log activity/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/task needs a due date/);
  });
});

describe("tasks", () => {
  const adminProps = { ...baseProps, canManage: true };

  it("flags an overdue task", () => {
    render(
      <ActivityTimeline
        entries={[
          activityEntry({
            type: "TASK",
            typeLabel: "Task",
            subject: "Chase the energy certificate",
            occurredAt: null,
            dueAt: "2020-01-01T00:00:00.000Z",
          }),
        ]}
        {...adminProps}
      />,
    );

    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("does not flag a completed task as overdue", () => {
    render(
      <ActivityTimeline
        entries={[
          activityEntry({
            type: "TASK",
            typeLabel: "Task",
            occurredAt: null,
            dueAt: "2020-01-01T00:00:00.000Z",
            completedAt: "2020-01-02T00:00:00.000Z",
          }),
        ]}
        {...adminProps}
      />,
    );

    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("completes a task through the action", async () => {
    const user = userEvent.setup();
    render(
      <ActivityTimeline
        entries={[
          activityEntry({
            type: "TASK",
            typeLabel: "Task",
            subject: "Chase the certificate",
            occurredAt: null,
            dueAt: "2026-08-01T00:00:00.000Z",
          }),
        ]}
        {...adminProps}
      />,
    );

    await user.click(screen.getByLabelText('Complete "Chase the certificate"'));

    await waitFor(() =>
      expect(mockedSetTask).toHaveBeenCalledWith("a1", "User", USER_1, true),
    );
  });

  it("offers no completion control on a non-task", () => {
    render(<ActivityTimeline entries={[activityEntry()]} {...adminProps} />);

    // Completing a "Call" is meaningless.
    expect(screen.queryByLabelText(/Complete/)).not.toBeInTheDocument();
  });
});

describe("per-entry admin controls", () => {
  const adminProps = { ...baseProps, canManage: true };

  it("toggles client visibility", async () => {
    const user = userEvent.setup();
    render(<ActivityTimeline entries={[activityEntry()]} {...adminProps} />);

    await user.click(screen.getByLabelText('Share "Discussed the offer" with the client'));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("a1", "User", USER_1, { visibleToClient: true }),
    );
  });

  it("confirms before deleting", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<ActivityTimeline entries={[activityEntry()]} {...adminProps} />);

    await user.click(screen.getByLabelText('Delete "Discussed the offer"'));

    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("deletes once confirmed", async () => {
    const user = userEvent.setup();
    render(<ActivityTimeline entries={[activityEntry()]} {...adminProps} />);

    await user.click(screen.getByLabelText('Delete "Discussed the offer"'));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith("a1", "User", USER_1));
  });

  it("offers no controls on a system entry — audit rows are not editable", () => {
    render(<ActivityTimeline entries={[systemEntry]} {...adminProps} />);

    expect(screen.queryByLabelText(/Delete/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Share/)).not.toBeInTheDocument();
  });
});
