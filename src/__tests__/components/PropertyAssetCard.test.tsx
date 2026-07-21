import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PropertyAssetCard } from "@/components/ui/PropertyAssetCard";
import { MOCK_OWNED_PROPERTY } from "@/lib/projects";

describe("PropertyAssetCard", () => {
  it("renders the property name, address, floor, size, energy class, and delivery date", () => {
    render(<PropertyAssetCard property={MOCK_OWNED_PROPERTY} />);

    expect(screen.getByRole("heading", { name: MOCK_OWNED_PROPERTY.name })).toBeInTheDocument();
    expect(screen.getByText(MOCK_OWNED_PROPERTY.address)).toBeInTheDocument();
    expect(screen.getByText(String(MOCK_OWNED_PROPERTY.floor))).toBeInTheDocument();
    expect(screen.getByText(`${MOCK_OWNED_PROPERTY.sqm} m²`)).toBeInTheDocument();
    expect(screen.getByText(MOCK_OWNED_PROPERTY.energyClass)).toBeInTheDocument();
    expect(screen.getByText(MOCK_OWNED_PROPERTY.deliveryDate)).toBeInTheDocument();
  });

  it("links the address to a Google Maps search for it", () => {
    render(<PropertyAssetCard property={MOCK_OWNED_PROPERTY} />);

    const link = screen.getByRole("link", { name: new RegExp(MOCK_OWNED_PROPERTY.address) });
    expect(link).toHaveAttribute(
      "href",
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MOCK_OWNED_PROPERTY.address)}`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("embeds the presentation iframe with the property's pptUrl and a descriptive title", () => {
    render(<PropertyAssetCard property={MOCK_OWNED_PROPERTY} />);

    const iframe = screen.getByTitle(`${MOCK_OWNED_PROPERTY.name} presentation`);
    expect(iframe).toHaveAttribute("src", MOCK_OWNED_PROPERTY.pptUrl as string);
  });

  it("omits the iframe src attribute entirely when pptUrl is null, rather than passing null through", () => {
    render(<PropertyAssetCard property={{ ...MOCK_OWNED_PROPERTY, pptUrl: null }} />);

    const iframe = screen.getByTitle(`${MOCK_OWNED_PROPERTY.name} presentation`);
    expect(iframe).not.toHaveAttribute("src");
  });
});
