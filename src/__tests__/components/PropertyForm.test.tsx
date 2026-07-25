import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyForm } from "@/components/ui/PropertyForm";

describe("PropertyForm", () => {
  it("renders every field empty and status defaulted to Planning when no initialValues are given", () => {
    render(<PropertyForm submitLabel="Create Property" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Address")).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("PLANNING");
  });

  it("pre-fills every field from initialValues, for the edit-mode use case", () => {
    render(
      <PropertyForm
        submitLabel="Save Changes"
        initialValues={{ name: "Villa Elytra", address: "Chania, Crete", totalUnits: "8", status: "COMPLETED" }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Villa Elytra");
    expect(screen.getByLabelText("Address")).toHaveValue("Chania, Crete");
    expect(screen.getByLabelText("Total units")).toHaveValue(8);
    expect(screen.getByLabelText("Status")).toHaveValue("COMPLETED");
  });

  it("submits with numeric fields parsed to real numbers, not the raw strings typed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PropertyForm submitLabel="Create Property" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "New Villa");
    await user.type(screen.getByLabelText("Address"), "45 Beach Rd");
    await user.type(screen.getByLabelText("Area"), "Paros");
    await user.type(screen.getByLabelText("Total units"), "5");
    await user.type(screen.getByLabelText("Available units"), "3");
    await user.type(screen.getByLabelText("Floor"), "2");
    await user.type(screen.getByLabelText("Size (m²)"), "90");
    await user.type(screen.getByLabelText("Energy class"), "A");
    await user.type(screen.getByLabelText("Delivery date"), "2027-08-01");
    await user.type(screen.getByLabelText("Contract date"), "2026-05-01");
    await user.click(screen.getByRole("button", { name: "Create Property" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Villa",
        totalUnits: 5,
        availableUnits: 3,
        floor: 2,
        sqm: 90,
      }),
    );
  });

  it("omits imageUrl/mapUrl/pptUrl from the submitted values when left blank, so the data layer can derive defaults", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PropertyForm submitLabel="Create Property" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "New Villa");
    await user.type(screen.getByLabelText("Address"), "45 Beach Rd");
    await user.type(screen.getByLabelText("Area"), "Paros");
    await user.type(screen.getByLabelText("Total units"), "5");
    await user.type(screen.getByLabelText("Available units"), "3");
    await user.type(screen.getByLabelText("Floor"), "2");
    await user.type(screen.getByLabelText("Size (m²)"), "90");
    await user.type(screen.getByLabelText("Energy class"), "A");
    await user.type(screen.getByLabelText("Delivery date"), "2027-08-01");
    await user.type(screen.getByLabelText("Contract date"), "2026-05-01");
    await user.click(screen.getByRole("button", { name: "Create Property" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: undefined, mapUrl: undefined, pptUrl: null }),
    );
  });

  it("falls back to a generic error message when onSubmit rejects with a non-Error value", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue("boom");
    render(
      <PropertyForm
        submitLabel="Create Property"
        initialValues={{
          name: "X",
          address: "Y",
          area: "Z",
          totalUnits: "1",
          availableUnits: "1",
          floor: "0",
          sqm: "50",
          energyClass: "A",
          deliveryDate: "2027-01-01",
          contractDate: "2026-01-01",
        }}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create Property" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });

  it("lets the status and photo URL fields be changed via their own inputs", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PropertyForm
        submitLabel="Create Property"
        initialValues={{
          name: "X",
          address: "Y",
          area: "Z",
          totalUnits: "1",
          availableUnits: "1",
          floor: "0",
          sqm: "50",
          energyClass: "A",
          deliveryDate: "2027-01-01",
          contractDate: "2026-01-01",
        }}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Status"), "COMPLETED");
    await user.type(screen.getByLabelText(/Photo URL/), "https://example.com/real.png");
    await user.type(screen.getByLabelText(/Map URL/), "https://example.com/real-map");
    await user.type(screen.getByLabelText(/Presentation deck URL/), "https://example.com/deck");
    await user.click(screen.getByRole("button", { name: "Create Property" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "COMPLETED",
        imageUrl: "https://example.com/real.png",
        mapUrl: "https://example.com/real-map",
        pptUrl: "https://example.com/deck",
      }),
    );
  });

  it("displays onSubmit's rejection message as an inline error, rather than an unhandled rejection", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("Property name must not be empty."));
    render(
      <PropertyForm
        submitLabel="Create Property"
        initialValues={{
          name: "X",
          address: "Y",
          area: "Z",
          totalUnits: "1",
          availableUnits: "1",
          floor: "0",
          sqm: "50",
          energyClass: "A",
          deliveryDate: "2027-01-01",
          contractDate: "2026-01-01",
        }}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create Property" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Property name must not be empty.");
  });

  it("shows a validation error and never calls onSubmit when a numeric field isn't a number", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <PropertyForm
        submitLabel="Create Property"
        initialValues={{
          name: "X",
          address: "Y",
          area: "Z",
          totalUnits: "not-a-number",
          availableUnits: "1",
          floor: "0",
          sqm: "50",
          energyClass: "A",
          deliveryDate: "2027-01-01",
          contractDate: "2026-01-01",
        }}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create Property" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/must all be numbers/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders a Cancel button that calls onCancel when provided, and omits it entirely otherwise", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { rerender } = render(<PropertyForm submitLabel="Save Changes" onSubmit={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<PropertyForm submitLabel="Save Changes" onSubmit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });
});
