import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordSalePanel } from "./RecordSalePanel";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("./actions", () => ({ recordSaleAction: vi.fn() }));

import { recordSaleAction } from "./actions";

const mockedRecord = vi.mocked(recordSaleAction);

const PROPERTIES = [
  { id: "prop-1", name: "Aegean Court", area: "Athens" },
  { id: "prop-2", name: "Villa Elytra", area: "Glyfada" },
];
const CLIENTS = [{ id: "user_maria", name: "Maria Papadopoulos", email: "maria@example.com" }];

beforeEach(() => {
  mockRefresh.mockReset();
  mockedRecord.mockReset().mockResolvedValue(undefined);
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Record a sale/ }));
}

describe("prerequisites", () => {
  it("says which prerequisite is missing rather than just disabling the button", () => {
    // A disabled control with no explanation leaves the admin guessing; the
    // two causes have different fixes on different pages.
    render(<RecordSalePanel properties={[]} clients={CLIENTS} />);

    expect(screen.getByText(/No properties exist yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add one first/ })).toHaveAttribute(
      "href",
      "/dashboard/projects/new",
    );
  });

  it("points at the invite flow when there are no clients", () => {
    render(<RecordSalePanel properties={PROPERTIES} clients={[]} />);

    expect(screen.getByText(/a buyer needs an account/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Invite one/ })).toHaveAttribute(
      "href",
      "/dashboard/team",
    );
  });

  it("disables the trigger until both exist", () => {
    render(<RecordSalePanel properties={[]} clients={[]} />);
    expect(screen.getByRole("button", { name: /Record a sale/ })).toBeDisabled();
  });

  it("enables it once both exist", () => {
    render(<RecordSalePanel properties={PROPERTIES} clients={CLIENTS} />);
    expect(screen.getByRole("button", { name: /Record a sale/ })).toBeEnabled();
  });
});

describe("recording a sale", () => {
  it("captures buyer, unit, price and date in one action", async () => {
    // The whole point: this replaced a three-page flow.
    const user = userEvent.setup();
    render(<RecordSalePanel properties={PROPERTIES} clients={CLIENTS} />);
    await openDialog(user);

    await user.selectOptions(screen.getByLabelText("Property"), "prop-2");
    await user.selectOptions(screen.getByLabelText("Buyer"), "user_maria");
    await user.type(screen.getByLabelText("Sale price"), "250000");

    await user.click(screen.getByRole("button", { name: "Record sale" }));

    await waitFor(() =>
      expect(mockedRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyId: "prop-2",
          userId: "user_maria",
          salePrice: "250000",
        }),
      ),
    );
  });

  it("allows an unpriced sale — blank is a real state, not an error", async () => {
    const user = userEvent.setup();
    render(<RecordSalePanel properties={PROPERTIES} clients={CLIENTS} />);
    await openDialog(user);

    await user.selectOptions(screen.getByLabelText("Property"), "prop-1");
    await user.selectOptions(screen.getByLabelText("Buyer"), "user_maria");
    await user.click(screen.getByRole("button", { name: "Record sale" }));

    await waitFor(() =>
      expect(mockedRecord).toHaveBeenCalledWith(
        expect.objectContaining({ salePrice: "", saleDate: "" }),
      ),
    );
  });

  it("distinguishes the sale date from the date it was entered", async () => {
    const user = userEvent.setup();
    render(<RecordSalePanel properties={PROPERTIES} clients={CLIENTS} />);
    await openDialog(user);

    expect(screen.getByText(/not when it was entered here/)).toBeInTheDocument();
  });

  it("refreshes and closes on success", async () => {
    const user = userEvent.setup();
    render(<RecordSalePanel properties={PROPERTIES} clients={CLIENTS} />);
    await openDialog(user);

    await user.selectOptions(screen.getByLabelText("Property"), "prop-1");
    await user.selectOptions(screen.getByLabelText("Buyer"), "user_maria");
    await user.click(screen.getByRole("button", { name: "Record sale" }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Record sale" })).not.toBeInTheDocument();
  });

  it("surfaces a rejected save inline and keeps the form open", async () => {
    const user = userEvent.setup();
    mockedRecord.mockRejectedValueOnce(new Error("saleDate cannot be in the future."));
    render(<RecordSalePanel properties={PROPERTIES} clients={CLIENTS} />);
    await openDialog(user);

    await user.selectOptions(screen.getByLabelText("Property"), "prop-1");
    await user.selectOptions(screen.getByLabelText("Buyer"), "user_maria");
    await user.click(screen.getByRole("button", { name: "Record sale" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot be in the future/);
    // Losing the entered values on a validation error would be its own bug.
    expect(screen.getByRole("button", { name: "Record sale" })).toBeInTheDocument();
  });

  it("does not offer to create a property or client inline", async () => {
    // Both would produce half-populated records someone has to finish later:
    // a property needs a dozen fields, and a User row is written only by the
    // Clerk webhook, so a buyer cannot be created here at all.
    const user = userEvent.setup();
    render(<RecordSalePanel properties={PROPERTIES} clients={CLIENTS} />);
    await openDialog(user);

    expect(screen.queryByLabelText(/New property name/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/New buyer/)).not.toBeInTheDocument();
  });
});
