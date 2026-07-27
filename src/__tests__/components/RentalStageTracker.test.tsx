import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RentalStageTracker } from "@/components/ui/RentalStageTracker";
import type { RentalStageView } from "@/lib/rentalStages";

function buildStage(
  overrides: Partial<RentalStageView> & Pick<RentalStageView, "key" | "label" | "order">,
): RentalStageView {
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

const STAGES: RentalStageView[] = [
  buildStage({
    key: "REPRESENTATION_MANDATE_SIGNED",
    label: "Representation Mandate Signed",
    order: 1,
    slot: "pdf",
    status: "DONE",
    completedAt: "2026-07-01T00:00:00.000Z",
    attachmentFilename: "mandate.pdf",
    hasAttachment: true,
  }),
  buildStage({ key: "KEYS_DELIVERED", label: "Keys Delivered", order: 3 }),
];

describe("RentalStageTracker", () => {
  it("renders every stage with its label", () => {
    render(<RentalStageTracker stages={STAGES} />);

    expect(screen.getByText("Representation Mandate Signed")).toBeInTheDocument();
    expect(screen.getByText("Keys Delivered")).toBeInTheDocument();
  });

  it("shows a per-stage Done/Pending badge rather than deriving it from position", () => {
    // The old RentalRoadmap inferred status from a single current-stage
    // index; each stage now carries its own, so a later stage can be Done
    // while an earlier one is not.
    render(<RentalStageTracker stages={STAGES} />);

    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("summarises overall progress as a count", () => {
    render(<RentalStageTracker stages={STAGES} />);

    expect(screen.getByText("1 of 2 stages complete")).toBeInTheDocument();
  });

  it("shows the attachment filename when a stage has one", () => {
    render(<RentalStageTracker stages={STAGES} />);

    expect(screen.getByText("mandate.pdf")).toBeInTheDocument();
  });

  it("uses a photo icon for a photo-slot attachment rather than the document one", () => {
    const { container } = render(
      <RentalStageTracker
        stages={[
          buildStage({
            key: "PROPERTY_INSPECTION",
            label: "Property Inspection",
            order: 2,
            slot: "photo",
            attachmentFilename: "inspection.jpg",
            hasAttachment: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText("inspection.jpg")).toBeInTheDocument();
    expect(container.querySelector(".lucide-image")).toBeTruthy();
  });

  it("shows a completion date only for stages that have one", () => {
    render(<RentalStageTracker stages={STAGES} />);

    expect(screen.getByText("Completed 1 Jul 2026")).toBeInTheDocument();
  });

  it("renders the pending stage's number, and a check for the done one", () => {
    render(<RentalStageTracker stages={STAGES} />);

    // The done stage shows a check icon instead of its number.
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("renders offer details when the offer stage has them", () => {
    render(
      <RentalStageTracker
        stages={[
          buildStage({
            key: "OFFER",
            label: "Offer",
            order: 8,
            hasOfferFields: true,
            offerPrice: 1500,
            offerDurationMonths: 12,
            offerComments: "Includes parking",
          }),
        ]}
      />,
    );

    expect(screen.getByText("€1,500.00")).toBeInTheDocument();
    expect(screen.getByText("12 months")).toBeInTheDocument();
    expect(screen.getByText("Includes parking")).toBeInTheDocument();
  });

  it("uses the singular for a one-month duration", () => {
    render(
      <RentalStageTracker
        stages={[buildStage({ key: "OFFER", label: "Offer", order: 8, hasOfferFields: true, offerDurationMonths: 1 })]}
      />,
    );

    expect(screen.getByText("1 month")).toBeInTheDocument();
  });

  it("omits the offer block entirely when no offer terms are recorded", () => {
    render(
      <RentalStageTracker stages={[buildStage({ key: "OFFER", label: "Offer", order: 8, hasOfferFields: true })]} />,
    );

    expect(screen.queryByText("Price")).not.toBeInTheDocument();
    expect(screen.queryByText("Duration")).not.toBeInTheDocument();
  });

  it("leaves the connector unfilled when the preceding stage is still pending", () => {
    const { container } = render(
      <RentalStageTracker
        stages={[
          buildStage({ key: "VIEWINGS", label: "Viewings", order: 7 }),
          buildStage({ key: "CONTRACT_SIGNED", label: "Contract Signed", order: 9 }),
        ]}
      />,
    );

    // The connector below a pending stage must not read as completed
    // progress — the bar is the only at-a-glance signal on this screen.
    expect(container.querySelectorAll("span.bg-gray-200.w-0\\.5").length).toBeGreaterThan(0);
  });

  it("renders an empty list without crashing", () => {
    render(<RentalStageTracker stages={[]} />);

    expect(screen.getByText("0 of 0 stages complete")).toBeInTheDocument();
  });
});
