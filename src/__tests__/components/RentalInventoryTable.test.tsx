import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RentalInventoryTable } from "@/components/ui/RentalInventoryTable";
import type { RentalInventoryEntry } from "@/lib/data/portfolio";
import type { Project } from "@/lib/projects";

const PROPERTY: Project = {
  id: "property-1",
  name: "Villa Elytra",
  address: "Chania, Crete, Greece",
  area: "Chania",
  totalUnits: 1,
  availableUnits: 0,
  deliveryDate: "2026-12-15",
  contractDate: "2026-03-14",
  floor: 0,
  sqm: 185,
  energyClass: "A",
  imageUrl: "https://placehold.co/800x450",
  status: "COMPLETED",
  listedForRental: true,
  mapUrl: "https://maps.example",
  pptUrl: null,
};

function entry(overrides: Partial<RentalInventoryEntry> = {}): RentalInventoryEntry {
  return {
    property: PROPERTY,
    client: { userId: "user_1", name: "Maria Papadopoulos", email: "maria@example.com" },
    stagesCompleted: 3,
    stagesTotal: 10,
    currentStage: "Keys Delivered",
    ...overrides,
  } as RentalInventoryEntry;
}

describe("RentalInventoryTable", () => {
  it("renders each listed property with its client and current stage", () => {
    render(<RentalInventoryTable entries={[entry()]} />);

    expect(screen.getByText("Villa Elytra")).toBeVisible();
    expect(screen.getByText("Maria Papadopoulos")).toBeVisible();
    expect(screen.getByText("Keys Delivered")).toBeVisible();
    expect(screen.getByText("3 of 10")).toBeVisible();
  });

  it("exposes letting progress as an accessible progressbar", () => {
    render(<RentalInventoryTable entries={[entry()]} />);

    expect(screen.getByRole("progressbar", { name: /Villa Elytra/ })).toHaveAttribute("aria-valuenow", "30");
  });

  it("names an unassigned listing as needing action, not as a blank cell", () => {
    // This row is the reason the explicit listing flag exists: a unit for
    // rent with nobody assigned was previously invisible here.
    render(<RentalInventoryTable entries={[entry({ client: null, stagesCompleted: 0, currentStage: null })]} />);

    expect(screen.getByText("No client assigned")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open property" })).toHaveAttribute(
      "href",
      "/dashboard/projects/property-1",
    );
  });

  it("links an assigned listing to the client's profile, where the stages are managed", () => {
    render(<RentalInventoryTable entries={[entry()]} />);

    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/dashboard/clients/user_1");
  });

  it("says 'Not started' when no stage is complete", () => {
    render(<RentalInventoryTable entries={[entry({ stagesCompleted: 0, currentStage: null })]} />);

    expect(screen.getByText("Not started")).toBeVisible();
  });

  it("counts how many listings have not begun", () => {
    render(
      <RentalInventoryTable
        entries={[entry(), entry({ stagesCompleted: 0, currentStage: null })]}
      />,
    );

    expect(screen.getByText("1 has no letting stage completed yet.")).toBeVisible();
  });

  it("pluralises the not-started note for more than one listing", () => {
    render(
      <RentalInventoryTable
        entries={[
          entry({ stagesCompleted: 0, currentStage: null }),
          entry({ stagesCompleted: 0, currentStage: null, client: { userId: "user_2", name: "Bob", email: "b@example.com" } }),
        ]}
      />,
    );

    expect(screen.getByText("2 have no letting stage completed yet.")).toBeVisible();
  });

  it("renders zero progress rather than dividing by zero if the stage list were ever empty", () => {
    render(<RentalInventoryTable entries={[entry({ stagesCompleted: 0, stagesTotal: 0, currentStage: null })]} />);

    expect(screen.getByRole("progressbar", { name: /Villa Elytra/ })).toHaveAttribute("aria-valuenow", "0");
  });

  it("hides the not-started note when every listing is under way", () => {
    render(<RentalInventoryTable entries={[entry()]} />);

    expect(screen.queryByText(/no letting stage completed/)).not.toBeInTheDocument();
  });

  it("renders one row per owner for a property with several, without a duplicate-key collision", () => {
    render(
      <RentalInventoryTable
        entries={[
          entry(),
          entry({ client: { userId: "user_2", name: "Bob", email: "b@example.com" }, stagesCompleted: 1 }),
        ]}
      />,
    );

    // Header plus two body rows.
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("tells an admin how to add a property to the inventory instead of rendering an empty table", () => {
    render(<RentalInventoryTable entries={[]} />);

    expect(screen.getByText(/No properties are listed for rental/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
