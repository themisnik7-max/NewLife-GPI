import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectDetail } from "@/components/ui/ProjectDetail";
import { MOCK_PROJECTS } from "@/lib/projects";

const project = MOCK_PROJECTS[0];

// Reads a <dd>'s text directly via its <dt> sibling rather than
// screen.getByText(value) — several spec values (e.g. an area name) can
// also appear as a substring inside the address link rendered elsewhere on
// the page, so matching through the DOM relationship sidesteps any
// ambiguity instead of relying on getByText's exact-text-node matching.
function specValueFor(label: string): string | null {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent ?? null;
}

describe("ProjectDetail", () => {
  it("renders the project name and every spec row with the correct value", () => {
    render(<ProjectDetail project={project} />);

    expect(screen.getByRole("heading", { name: project.name })).toBeInTheDocument();
    expect(specValueFor("Address")).toBe(project.address);
    expect(specValueFor("Area")).toBe(project.area);
    expect(specValueFor("Total units")).toBe(String(project.totalUnits));
    expect(specValueFor("Available units")).toBe(String(project.availableUnits));
    expect(specValueFor("Floor")).toBe(String(project.floor));
    expect(specValueFor("Size")).toBe(`${project.sqm} m²`);
    expect(specValueFor("Energy class")).toBe(project.energyClass);
    expect(specValueFor("Contract date")).toBe(project.contractDate);
    expect(specValueFor("Delivery date")).toBe(project.deliveryDate);
  });

  it("links the address to a Google Maps search for it", () => {
    render(<ProjectDetail project={project} />);

    const link = screen.getByRole("link", { name: new RegExp(project.address) });
    expect(link).toHaveAttribute(
      "href",
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}`,
    );
  });

  it("embeds the presentation iframe with the project's pptUrl", () => {
    render(<ProjectDetail project={project} />);

    const iframe = screen.getByTitle(`${project.name} presentation`);
    expect(iframe).toHaveAttribute("src", project.pptUrl as string);
  });

  it("omits the iframe src attribute entirely when pptUrl is null, rather than passing null through", () => {
    render(<ProjectDetail project={{ ...project, pptUrl: null }} />);

    const iframe = screen.getByTitle(`${project.name} presentation`);
    expect(iframe).not.toHaveAttribute("src");
  });

  it("links back to the projects list", () => {
    render(<ProjectDetail project={project} />);

    const backLink = screen.getByRole("link", { name: /Back to all projects/ });
    expect(backLink).toHaveAttribute("href", "/dashboard/projects");
  });
});
