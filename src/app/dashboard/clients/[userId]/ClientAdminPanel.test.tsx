import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientAdminPanel } from "./ClientAdminPanel";
import { MOCK_PROJECTS } from "@/lib/projects";
import type { VisaStepEntry } from "@/lib/data/visa";
import type { RentalStageView } from "@/lib/rentalStages";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("./actions", () => ({
  assignPropertyAction: vi.fn(),
  setRentalStageStatusAction: vi.fn(),
  setOfferDetailsAction: vi.fn(),
  uploadRentalStageFileAction: vi.fn(),
  getRentalStageFileUrlAction: vi.fn(),
  createVisaStepAction: vi.fn(),
  updateVisaStepStatusAction: vi.fn(),
  createLedgerEntryAction: vi.fn(),
}));

import {
  assignPropertyAction,
  createLedgerEntryAction,
  createVisaStepAction,
  setRentalStageStatusAction,
  setOfferDetailsAction,
  updateVisaStepStatusAction,
} from "./actions";

const mockedAssign = vi.mocked(assignPropertyAction);
const mockedSetStageStatus = vi.mocked(setRentalStageStatusAction);
const mockedSetOffer = vi.mocked(setOfferDetailsAction);
const mockedCreateVisaStep = vi.mocked(createVisaStepAction);
const mockedUpdateVisaStatus = vi.mocked(updateVisaStepStatusAction);
const mockedCreateLedger = vi.mocked(createLedgerEntryAction);

const USER_ID = "user_client1";
const PROPERTIES = MOCK_PROJECTS.slice(0, 2);
const ASSIGNED = PROPERTIES[0];

const VISA_STEPS: VisaStepEntry[] = [
  { id: "step-1", stepOrder: 1, title: "Submit application", description: null, status: "PENDING", completedAt: null },
];

function buildStage(overrides: Partial<RentalStageView> & Pick<RentalStageView, "key" | "label" | "order">): RentalStageView {
  return {
    slot: "none",
    hasOfferFields: false,
    status: "PENDING",
    completedAt: null,
    attachmentFilename: null,
    hasAttachment: false,
    offerPrice: null,
    offerDurationMonths: null,
    offerComments: null,
    ...overrides,
  };
}

// Three stages covering the shapes the panel must handle: a plain one, one
// with a file slot, and the offer one — rather than the full canonical ten,
// which would make each assertion harder to read without testing anything more.
const RENTAL_STAGES_FIXTURE: RentalStageView[] = [
  buildStage({ key: "KEYS_DELIVERED", label: "Keys Delivered", order: 3 }),
  buildStage({ key: "ENERGY_CERTIFICATE", label: "Energy Certificate", order: 4, slot: "pdf" }),
  buildStage({ key: "OFFER", label: "Offer", order: 8, hasOfferFields: true }),
];

beforeEach(() => {
  mockRefresh.mockReset();
  mockedAssign.mockReset().mockResolvedValue(undefined as never);
  mockedSetStageStatus.mockReset().mockResolvedValue(undefined as never);
  mockedSetOffer.mockReset().mockResolvedValue(undefined as never);
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
      rentalStages={RENTAL_STAGES_FIXTURE}
      storageConfigured
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

describe("ClientAdminPanel — rental workflow", () => {
  it("lists every stage with its order, label, and current status", () => {
    renderPanel();

    expect(screen.getByText("3. Keys Delivered")).toBeInTheDocument();
    expect(screen.getByLabelText("Status for Keys Delivered")).toHaveValue("PENDING");
  });

  it("marks a stage DONE and refreshes", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(screen.getByLabelText("Status for Keys Delivered"), "DONE");

    await waitFor(() => expect(mockedSetStageStatus).toHaveBeenCalled());
    expect(mockedSetStageStatus).toHaveBeenCalledWith(USER_ID, "KEYS_DELIVERED", "DONE");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("offers a file input only on stages that have a slot", () => {
    const { container } = renderPanel();

    // One slot in the fixture (ENERGY_CERTIFICATE), so exactly one input.
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
  });

  it("explains itself instead of offering uploads when storage is not configured", () => {
    const { container } = renderPanel({ storageConfigured: false });

    expect(screen.getByText(/File storage is not configured/)).toBeInTheDocument();
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(0);
  });

  it("saves offer details with the duration parsed to a number, not a string", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("Offer price (EUR)"), "1500");
    await user.type(screen.getByLabelText("Duration (months)"), "12");
    await user.type(screen.getByLabelText("Comments"), "Includes parking");
    await user.click(screen.getByRole("button", { name: "Save offer" }));

    await waitFor(() => expect(mockedSetOffer).toHaveBeenCalled());
    expect(mockedSetOffer).toHaveBeenCalledWith(USER_ID, {
      price: 1500,
      durationMonths: 12,
      comments: "Includes parking",
    });
  });

  it("sends nulls rather than empty strings when offer fields are left blank", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Save offer" }));

    await waitFor(() => expect(mockedSetOffer).toHaveBeenCalled());
    expect(mockedSetOffer).toHaveBeenCalledWith(USER_ID, {
      price: null,
      durationMonths: null,
      comments: null,
    });
  });

  it("pre-fills offer fields from existing recorded values", () => {
    renderPanel({
      rentalStages: [
        buildStage({
          key: "OFFER",
          label: "Offer",
          order: 8,
          hasOfferFields: true,
          offerPrice: 2000,
          offerDurationMonths: 24,
          offerComments: "Renewable",
        }),
      ],
    });

    expect(screen.getByLabelText("Offer price (EUR)")).toHaveValue(2000);
    expect(screen.getByLabelText("Duration (months)")).toHaveValue(24);
    expect(screen.getByLabelText("Comments")).toHaveValue("Renewable");
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
