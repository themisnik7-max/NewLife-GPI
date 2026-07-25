import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MilestoneAdminPanel } from "./MilestoneAdminPanel";
import type { MilestoneEntry } from "@/lib/data/construction";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("../actions", () => ({
  createMilestoneAction: vi.fn(),
  updateMilestoneStatusAction: vi.fn(),
}));

import { createMilestoneAction, updateMilestoneStatusAction } from "../actions";
const mockedCreate = vi.mocked(createMilestoneAction);
const mockedUpdateStatus = vi.mocked(updateMilestoneStatusAction);

const PROPERTY_ID = "prop-1";
const MILESTONES: MilestoneEntry[] = [
  {
    id: "milestone-1",
    propertyId: PROPERTY_ID,
    title: "Foundation poured",
    description: null,
    status: "IN_PROGRESS",
    targetDate: "2026-09-01",
    completionDate: null,
  },
];

beforeEach(() => {
  mockRefresh.mockReset();
  mockedCreate.mockReset().mockResolvedValue(undefined as never);
  mockedUpdateStatus.mockReset().mockResolvedValue(undefined as never);
});

describe("MilestoneAdminPanel", () => {
  it("lists each existing milestone with its current status selected", () => {
    render(<MilestoneAdminPanel propertyId={PROPERTY_ID} milestones={MILESTONES} />);

    expect(screen.getByText("Foundation poured")).toBeInTheDocument();
    expect(screen.getByLabelText("Status for Foundation poured")).toHaveValue("IN_PROGRESS");
  });

  it("shows an empty-state message when the property has no milestones yet", () => {
    render(<MilestoneAdminPanel propertyId={PROPERTY_ID} milestones={[]} />);

    expect(screen.getByText(/No milestones on record/)).toBeInTheDocument();
  });

  it("calls updateMilestoneStatusAction with the property, milestone, and new status, then refreshes", async () => {
    const user = userEvent.setup();
    render(<MilestoneAdminPanel propertyId={PROPERTY_ID} milestones={MILESTONES} />);

    await user.selectOptions(screen.getByLabelText("Status for Foundation poured"), "COMPLETED");

    await waitFor(() => expect(mockedUpdateStatus).toHaveBeenCalled());
    expect(mockedUpdateStatus).toHaveBeenCalledWith(PROPERTY_ID, "milestone-1", "COMPLETED");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("keeps the Add milestone button disabled until both a title and a target date are entered", async () => {
    const user = userEvent.setup();
    render(<MilestoneAdminPanel propertyId={PROPERTY_ID} milestones={[]} />);

    const addButton = screen.getByRole("button", { name: "Add milestone" });
    expect(addButton).toBeDisabled();

    await user.type(screen.getByLabelText("New milestone"), "Roofing");
    expect(addButton).toBeDisabled();

    await user.type(screen.getByLabelText("Target date"), "2026-11-01");
    expect(addButton).toBeEnabled();
  });

  it("creates a milestone, then clears the form and refreshes", async () => {
    const user = userEvent.setup();
    render(<MilestoneAdminPanel propertyId={PROPERTY_ID} milestones={[]} />);

    await user.type(screen.getByLabelText("New milestone"), "Roofing");
    await user.type(screen.getByLabelText("Description (optional)"), "Tiles and insulation");
    await user.type(screen.getByLabelText("Target date"), "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Add milestone" }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate).toHaveBeenCalledWith(PROPERTY_ID, {
      title: "Roofing",
      description: "Tiles and insulation",
      targetDate: "2026-11-01",
    });
    await waitFor(() => expect(screen.getByLabelText("New milestone")).toHaveValue(""));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("passes a null description when the optional field is left blank", async () => {
    const user = userEvent.setup();
    render(<MilestoneAdminPanel propertyId={PROPERTY_ID} milestones={[]} />);

    await user.type(screen.getByLabelText("New milestone"), "Roofing");
    await user.type(screen.getByLabelText("Target date"), "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Add milestone" }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][1].description).toBeNull();
  });

  it("surfaces a rejected action as an inline alert instead of an unhandled rejection", async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValueOnce(new Error("Milestone title must not be empty."));
    render(<MilestoneAdminPanel propertyId={PROPERTY_ID} milestones={[]} />);

    await user.type(screen.getByLabelText("New milestone"), "X");
    await user.type(screen.getByLabelText("Target date"), "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Add milestone" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Milestone title must not be empty.");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when an action rejects with a non-Error value", async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValueOnce("boom");
    render(<MilestoneAdminPanel propertyId={PROPERTY_ID} milestones={[]} />);

    await user.type(screen.getByLabelText("New milestone"), "X");
    await user.type(screen.getByLabelText("Target date"), "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Add milestone" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
