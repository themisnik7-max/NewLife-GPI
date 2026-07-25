import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientAdminPanel } from "./ClientAdminPanel";
import { MOCK_PROJECTS } from "@/lib/projects";
import type { VisaStepEntry } from "@/lib/data/visa";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("./actions", () => ({
  assignPropertyAction: vi.fn(),
  updateRentalStageAction: vi.fn(),
  createVisaStepAction: vi.fn(),
  updateVisaStepStatusAction: vi.fn(),
  createLedgerEntryAction: vi.fn(),
}));

import {
  assignPropertyAction,
  createLedgerEntryAction,
  createVisaStepAction,
  updateRentalStageAction,
  updateVisaStepStatusAction,
} from "./actions";

const mockedAssign = vi.mocked(assignPropertyAction);
const mockedUpdateStage = vi.mocked(updateRentalStageAction);
const mockedCreateVisaStep = vi.mocked(createVisaStepAction);
const mockedUpdateVisaStatus = vi.mocked(updateVisaStepStatusAction);
const mockedCreateLedger = vi.mocked(createLedgerEntryAction);

const USER_ID = "user_client1";
const PROPERTIES = MOCK_PROJECTS.slice(0, 2);
const ASSIGNED = PROPERTIES[0];

const VISA_STEPS: VisaStepEntry[] = [
  { id: "step-1", stepOrder: 1, title: "Submit application", description: null, status: "PENDING", completedAt: null },
];

beforeEach(() => {
  mockRefresh.mockReset();
  mockedAssign.mockReset().mockResolvedValue(undefined as never);
  mockedUpdateStage.mockReset().mockResolvedValue(undefined as never);
  mockedCreateVisaStep.mockReset().mockResolvedValue(undefined as never);
  mockedUpdateVisaStatus.mockReset().mockResolvedValue(undefined as never);
  mockedCreateLedger.mockReset().mockResolvedValue(undefined as never);
});

function renderPanel(overrides: Partial<React.ComponentProps<typeof ClientAdminPanel>> = {}) {
  return render(
    <ClientAdminPanel
      userId={USER_ID}
      availableProperties={PROPERTIES}
      assignedProperty={ASSIGNED}
      currentRentalStage="LEGAL_REVIEW"
      visaSteps={VISA_STEPS}
      {...overrides}
    />,
  );
}

describe("ClientAdminPanel — property assignment", () => {
  it("shows the currently assigned property", () => {
    renderPanel();

    expect(screen.getByText(ASSIGNED.name)).toBeInTheDocument();
  });

  it("says no property is assigned when the client has none", () => {
    renderPanel({ assignedProperty: null });

    expect(screen.getByText("No property assigned yet.")).toBeInTheDocument();
  });

  it("assigns the selected property and refreshes", async () => {
    const user = userEvent.setup();
    renderPanel({ assignedProperty: null });

    await user.selectOptions(screen.getByLabelText("Assign a property"), PROPERTIES[1].id);
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() => expect(mockedAssign).toHaveBeenCalled());
    expect(mockedAssign).toHaveBeenCalledWith(USER_ID, PROPERTIES[1].id);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("explains what to do first when no properties exist in the tenant at all", () => {
    renderPanel({ availableProperties: [], assignedProperty: null });

    expect(screen.getByText(/No properties exist in this tenant yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign" })).not.toBeInTheDocument();
  });
});

describe("ClientAdminPanel — rental stage", () => {
  it("pre-selects the client's current stage", () => {
    renderPanel();

    expect(screen.getByLabelText("Current stage")).toHaveValue("LEGAL_REVIEW");
  });

  it("defaults to RESERVATION when the client has no stage recorded yet", () => {
    renderPanel({ currentRentalStage: null });

    expect(screen.getByLabelText("Current stage")).toHaveValue("RESERVATION");
  });

  it("updates the stage and refreshes", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(screen.getByLabelText("Current stage"), "HANDOVER");
    await user.click(screen.getByRole("button", { name: "Update stage" }));

    await waitFor(() => expect(mockedUpdateStage).toHaveBeenCalled());
    expect(mockedUpdateStage).toHaveBeenCalledWith(USER_ID, "HANDOVER");
  });

  it("gates the stage control behind having a property, since stage is tracked per property", () => {
    renderPanel({ assignedProperty: null });

    expect(screen.getByText(/Assign a property first — rental stage is tracked per property/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update stage" })).not.toBeInTheDocument();
  });
});

describe("ClientAdminPanel — visa steps", () => {
  it("lists existing steps with their order, title, and current status", () => {
    renderPanel();

    expect(screen.getByText("1. Submit application")).toBeInTheDocument();
    expect(screen.getByLabelText("Status for Submit application")).toHaveValue("PENDING");
  });

  it("updates a step's status and refreshes", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(screen.getByLabelText("Status for Submit application"), "COMPLETED");

    await waitFor(() => expect(mockedUpdateVisaStatus).toHaveBeenCalled());
    expect(mockedUpdateVisaStatus).toHaveBeenCalledWith(USER_ID, "step-1", "COMPLETED");
  });

  it("keeps Add step disabled until a title is entered", async () => {
    const user = userEvent.setup();
    renderPanel();

    const addButton = screen.getByRole("button", { name: "Add step" });
    expect(addButton).toBeDisabled();

    await user.type(screen.getByLabelText("New step title"), "Biometrics");
    expect(addButton).toBeEnabled();
  });

  it("creates a step, clears the form, and refreshes", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("New step title"), "Biometrics");
    await user.click(screen.getByRole("button", { name: "Add step" }));

    await waitFor(() => expect(mockedCreateVisaStep).toHaveBeenCalled());
    expect(mockedCreateVisaStep).toHaveBeenCalledWith(USER_ID, { title: "Biometrics", description: null });
    await waitFor(() => expect(screen.getByLabelText("New step title")).toHaveValue(""));
  });

  it("passes an entered description through, and clears it afterwards too", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("New step title"), "Biometrics");
    await user.type(screen.getByLabelText("Description (optional)"), "At the Athens office");
    await user.click(screen.getByRole("button", { name: "Add step" }));

    await waitFor(() => expect(mockedCreateVisaStep).toHaveBeenCalled());
    expect(mockedCreateVisaStep).toHaveBeenCalledWith(USER_ID, {
      title: "Biometrics",
      description: "At the Athens office",
    });
    await waitFor(() => expect(screen.getByLabelText("Description (optional)")).toHaveValue(""));
  });
});

describe("ClientAdminPanel — payment installments", () => {
  it("creates an installment against the assigned property, then clears the form", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("Amount (EUR)"), "15000");
    await user.type(screen.getByLabelText("Due date"), "2026-09-01");
    await user.click(screen.getByRole("button", { name: "Add installment" }));

    await waitFor(() => expect(mockedCreateLedger).toHaveBeenCalled());
    expect(mockedCreateLedger).toHaveBeenCalledWith(USER_ID, ASSIGNED.id, 15000, "2026-09-01");
    await waitFor(() => expect(screen.getByLabelText("Amount (EUR)")).toHaveValue(null));
  });

  it("gates installments behind having a property, since one is always owed against a property", () => {
    renderPanel({ assignedProperty: null });

    expect(screen.getByText(/an installment is always owed against a specific property/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add installment" })).not.toBeInTheDocument();
  });

  it("surfaces a rejected action as an inline alert and does not refresh", async () => {
    const user = userEvent.setup();
    mockedCreateLedger.mockRejectedValueOnce(new Error("amount must be a positive, finite number."));
    renderPanel();

    await user.type(screen.getByLabelText("Amount (EUR)"), "5");
    await user.type(screen.getByLabelText("Due date"), "2026-09-01");
    await user.click(screen.getByRole("button", { name: "Add installment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("amount must be a positive, finite number.");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when an action rejects with a non-Error value", async () => {
    const user = userEvent.setup();
    mockedCreateLedger.mockRejectedValueOnce("boom");
    renderPanel();

    await user.type(screen.getByLabelText("Amount (EUR)"), "5");
    await user.type(screen.getByLabelText("Due date"), "2026-09-01");
    await user.click(screen.getByRole("button", { name: "Add installment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
