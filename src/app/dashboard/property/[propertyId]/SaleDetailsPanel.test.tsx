import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaleDetailsPanel } from "./SaleDetailsPanel";
import type { OwnershipRecord } from "@/lib/data/propertyOwnership";

vi.mock("./actions", () => ({
  updateSaleDetailsAction: vi.fn(),
}));

import { updateSaleDetailsAction } from "./actions";

const mockedUpdate = vi.mocked(updateSaleDetailsAction);

function ownership(overrides: Partial<OwnershipRecord> = {}): OwnershipRecord {
  return {
    id: "ownership-1",
    userId: "user_1",
    clientName: "Maria Papadopoulos",
    saleDate: "2026-03-14",
    salePrice: 425000,
    ...overrides,
  };
}

beforeEach(() => {
  mockedUpdate.mockReset().mockResolvedValue(undefined);
});

describe("SaleDetailsPanel", () => {
  it("renders one form per buyer, so one buyer's figures cannot overwrite another's", () => {
    render(
      <SaleDetailsPanel
        propertyId="property-1"
        ownerships={[ownership(), ownership({ id: "ownership-2", userId: "user_2", clientName: "Bob" })]}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(2);
    expect(screen.getByText("Maria Papadopoulos")).toBeVisible();
    expect(screen.getByText("Bob")).toBeVisible();
  });

  it("prefills the stored sale date and price", () => {
    render(<SaleDetailsPanel propertyId="property-1" ownerships={[ownership()]} />);

    expect(screen.getByLabelText("Sale date")).toHaveValue("2026-03-14");
    expect(screen.getByLabelText("Sale price (€)")).toHaveValue(425000);
  });

  it("leaves the fields blank rather than showing zero for an unrecorded sale", () => {
    // Zero is a price; blank is "we do not know yet". Conflating them would
    // put a fabricated €0 into the portfolio total.
    render(<SaleDetailsPanel propertyId="property-1" ownerships={[ownership({ saleDate: null, salePrice: null })]} />);

    expect(screen.getByLabelText("Sale date")).toHaveValue("");
    expect(screen.getByLabelText("Sale price (€)")).toHaveValue(null);
  });

  it("submits the ownership id, not the user id — one client can own several properties", async () => {
    const user = userEvent.setup();
    render(<SaleDetailsPanel propertyId="property-1" ownerships={[ownership()]} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("property-1", "ownership-1", {
        saleDate: "2026-03-14",
        salePrice: 425000,
      }),
    );
  });

  it("sends null for a cleared price, which is what makes a typo correctable", async () => {
    const user = userEvent.setup();
    render(<SaleDetailsPanel propertyId="property-1" ownerships={[ownership()]} />);

    await user.clear(screen.getByLabelText("Sale price (€)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("property-1", "ownership-1", expect.objectContaining({ salePrice: null })),
    );
  });

  it("sends null for a cleared date", async () => {
    const user = userEvent.setup();
    render(<SaleDetailsPanel propertyId="property-1" ownerships={[ownership()]} />);

    await user.clear(screen.getByLabelText("Sale date"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("property-1", "ownership-1", expect.objectContaining({ saleDate: null })),
    );
  });

  it("rejects a non-positive price before the round trip, without calling the action", async () => {
    const user = userEvent.setup();
    render(<SaleDetailsPanel propertyId="property-1" ownerships={[ownership()]} />);

    await user.clear(screen.getByLabelText("Sale price (€)"));
    await user.type(screen.getByLabelText("Sale price (€)"), "-5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sale price must be a positive number.");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("confirms a successful save", async () => {
    const user = userEvent.setup();
    render(<SaleDetailsPanel propertyId="property-1" ownerships={[ownership()]} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  it("surfaces a server rejection inline", async () => {
    mockedUpdate.mockRejectedValueOnce(new Error("saleDate cannot be in the future."));
    const user = userEvent.setup();
    render(<SaleDetailsPanel propertyId="property-1" ownerships={[ownership()]} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("saleDate cannot be in the future.");
  });

  it("keeps each buyer's error scoped to their own form", async () => {
    mockedUpdate.mockRejectedValueOnce(new Error("Rejected."));
    const user = userEvent.setup();
    render(
      <SaleDetailsPanel
        propertyId="property-1"
        ownerships={[ownership(), ownership({ id: "ownership-2", userId: "user_2", clientName: "Bob" })]}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Save" })[0]);

    await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("renders nothing at all for a property with no owners", () => {
    const { container } = render(<SaleDetailsPanel propertyId="property-1" ownerships={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("explains that a blank field is preferable to a placeholder figure", () => {
    render(<SaleDetailsPanel propertyId="property-1" ownerships={[ownership()]} />);

    const section = screen.getByRole("heading", { name: "Record sale details" }).closest("section")!;
    expect(within(section).getByText(/leave blank if you do not have the figure yet/i)).toBeVisible();
  });
});
