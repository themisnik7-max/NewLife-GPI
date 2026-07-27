import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SoldPropertiesTable } from "@/components/ui/SoldPropertiesTable";
import type { SoldProperty } from "@/lib/data/portfolio";
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
  status: "UNDER_CONSTRUCTION",
  listedForRental: false,
  mapUrl: "https://maps.example",
  pptUrl: null,
};

function owner(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user_1",
    name: "Maria Papadopoulos",
    email: "maria@example.com",
    saleDate: "2026-03-14",
    salePrice: 425000,
    recordedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function sold(overrides: Partial<SoldProperty> = {}): SoldProperty {
  return {
    property: PROPERTY,
    owners: [owner()],
    totalSaleValue: 425000,
    ownersMissingSalePrice: 0,
    ...overrides,
  } as SoldProperty;
}

describe("SoldPropertiesTable", () => {
  it("renders the property with its buyer, sale date and price", () => {
    render(<SoldPropertiesTable properties={[sold()]} />);

    expect(screen.getByText("Villa Elytra")).toBeVisible();
    expect(screen.getByText("Maria Papadopoulos")).toBeVisible();
    expect(screen.getByText("14 Mar 2026")).toBeVisible();
    expect(screen.getAllByText("€425,000.00").length).toBeGreaterThan(0);
  });

  it("links a buyer to their client profile and the property to its detail page", () => {
    render(<SoldPropertiesTable properties={[sold()]} />);

    expect(screen.getByRole("link", { name: "Maria Papadopoulos" })).toHaveAttribute(
      "href",
      "/dashboard/clients/user_1",
    );
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute(
      "href",
      "/dashboard/property/property-1",
    );
  });

  it("says 'Not recorded' for a missing sale date, and names the app timestamp separately", () => {
    // A bare dash would invite reading the recorded-in-app date as the sale
    // date, which is exactly the conflation migration 0009 refused to make.
    render(<SoldPropertiesTable properties={[sold({ owners: [owner({ saleDate: null })] })]} />);

    const cell = screen.getByText("Not recorded");
    expect(cell).toHaveAttribute("title", "Recorded in app 1 Apr 2026");
  });

  it("shows a dash for a missing sale price rather than a zero", () => {
    render(
      <SoldPropertiesTable
        properties={[sold({ owners: [owner({ salePrice: null })], totalSaleValue: 0, ownersMissingSalePrice: 1 })]}
      />,
    );

    expect(screen.getByText("—")).toBeVisible();
  });

  it("surfaces how many sales are excluded from the portfolio total", () => {
    render(
      <SoldPropertiesTable
        properties={[sold({ owners: [owner({ salePrice: null })], totalSaleValue: 0, ownersMissingSalePrice: 1 })]}
      />,
    );

    expect(screen.getByText("1 sale has no price recorded and is excluded from the total.")).toBeVisible();
  });

  it("pluralises the exclusion note for more than one missing price", () => {
    render(
      <SoldPropertiesTable
        properties={[
          sold({
            owners: [owner({ salePrice: null }), owner({ userId: "user_2", salePrice: null })],
            totalSaleValue: 0,
            ownersMissingSalePrice: 2,
          }),
        ]}
      />,
    );

    expect(screen.getByText("2 sales have no price recorded and are excluded from the total.")).toBeVisible();
  });

  it("hides the exclusion note entirely when every sale has a price", () => {
    render(<SoldPropertiesTable properties={[sold()]} />);

    expect(screen.queryByText(/no price recorded/)).not.toBeInTheDocument();
  });

  it("keeps one row per property when it has several buyers, and subtotals them", () => {
    render(
      <SoldPropertiesTable
        properties={[
          sold({
            owners: [owner(), owner({ userId: "user_2", name: "Bob", email: "b@example.com", salePrice: 75000 })],
            totalSaleValue: 500000,
          }),
        ]}
      />,
    );

    // One row for the property, not one per buyer — otherwise the row count
    // would disagree with the property count in the header.
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getAllByText("€500,000.00").length).toBeGreaterThan(0);
  });

  it("flags a sold property that is also in the lettings inventory", () => {
    render(<SoldPropertiesTable properties={[sold({ property: { ...PROPERTY, listedForRental: true } })]} />);

    expect(screen.getByText("For rental")).toBeVisible();
  });

  it("explains how to get started instead of rendering an empty table", () => {
    render(<SoldPropertiesTable properties={[]} />);

    expect(screen.getByText(/No properties have been sold yet/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
