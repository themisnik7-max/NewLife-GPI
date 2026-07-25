import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyDetailWithEdit } from "./PropertyDetailWithEdit";
import { MOCK_PROJECTS } from "@/lib/projects";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("../actions", () => ({
  updatePropertyAction: vi.fn(),
}));

import { updatePropertyAction } from "../actions";
const mockedUpdatePropertyAction = vi.mocked(updatePropertyAction);

const project = MOCK_PROJECTS[0];

describe("PropertyDetailWithEdit", () => {
  it("shows the read-only ProjectDetail view with no Edit button for a non-admin", () => {
    render(<PropertyDetailWithEdit project={project} isAdmin={false} />);

    expect(screen.getByRole("heading", { name: project.name })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("shows an Edit button for an admin, which swaps to PropertyForm pre-filled with the project's values", async () => {
    const user = userEvent.setup();
    render(<PropertyDetailWithEdit project={project} isAdmin />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Name")).toHaveValue(project.name);
    expect(screen.getByLabelText("Total units")).toHaveValue(project.totalUnits);
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
  });

  it("returns to the read-only view without saving when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<PropertyDetailWithEdit project={project} isAdmin />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: project.name })).toBeInTheDocument();
    expect(mockedUpdatePropertyAction).not.toHaveBeenCalled();
  });

  it("pre-fills an empty pptUrl field, rather than the literal string 'null', when the project has none", async () => {
    const user = userEvent.setup();
    render(<PropertyDetailWithEdit project={{ ...project, pptUrl: null }} isAdmin />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText(/Presentation deck URL/)).toHaveValue("");
  });

  it("calls updatePropertyAction with the project's id and refreshes the route on save", async () => {
    const user = userEvent.setup();
    mockedUpdatePropertyAction.mockResolvedValueOnce(undefined as never);
    render(<PropertyDetailWithEdit project={project} isAdmin />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mockedUpdatePropertyAction).toHaveBeenCalled());
    expect(mockedUpdatePropertyAction.mock.calls[0][0]).toBe(project.id);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    // Exits back to the read-only view after a successful save.
    expect(screen.getByRole("heading", { name: project.name })).toBeInTheDocument();
  });
});
