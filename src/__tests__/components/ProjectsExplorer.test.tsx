import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectsExplorer } from "@/components/ui/ProjectsExplorer";
import { MOCK_PROJECTS } from "@/lib/projects";

describe("ProjectsExplorer", () => {
  it("filters visible projects by name, address, or area as the user types", async () => {
    const user = userEvent.setup();
    render(<ProjectsExplorer />);

    for (const project of MOCK_PROJECTS) {
      expect(screen.getByText(project.name)).toBeInTheDocument();
    }

    const search = screen.getByRole("textbox", { name: "Search projects" });
    const parosProject = MOCK_PROJECTS.find((project) => project.area === "Paros")!;
    await user.type(search, "paros");

    expect(screen.getByText(parosProject.name)).toBeInTheDocument();
    for (const project of MOCK_PROJECTS) {
      if (project.id !== parosProject.id) {
        expect(screen.queryByText(project.name)).not.toBeInTheDocument();
      }
    }
  });

  it("filters by area even when the name and address don't match the query", async () => {
    const user = userEvent.setup();
    render(<ProjectsExplorer />);

    const santoriniProject = MOCK_PROJECTS.find((project) => project.area === "Santorini")!;
    const search = screen.getByRole("textbox", { name: "Search projects" });
    await user.type(search, "santorini");

    expect(screen.getByText(santoriniProject.name)).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2); // header row + 1 matching data row
  });

  it("alternates between the table layout and the card grid layout when the toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<ProjectsExplorer />);

    expect(screen.getByRole("table")).toBeInTheDocument();

    const toggle = screen.getByRole("switch", { name: "Toggle between table view and slot view" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByTestId("projects-grid")).toBeInTheDocument();
    expect(screen.getByText(MOCK_PROJECTS[0].name)).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByTestId("projects-grid")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when no project matches the search", async () => {
    const user = userEvent.setup();
    render(<ProjectsExplorer />);

    const search = screen.getByRole("textbox", { name: "Search projects" });
    await user.type(search, "nonexistent-project-xyz");

    expect(screen.getByText("No projects match your search.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
