import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientRoster } from "./ClientRoster";
import { EMPTY_VIEW } from "@/lib/views";
import type { ClientDirectoryEntry } from "@/lib/data/clients";

vi.mock("./actions", () => ({
  saveViewAction: vi.fn(),
  deleteSavedViewAction: vi.fn(),
}));

import { deleteSavedViewAction, saveViewAction } from "./actions";

const mockedSave = vi.mocked(saveViewAction);
const mockedDelete = vi.mocked(deleteSavedViewAction);

function makeClient(overrides: Partial<ClientDirectoryEntry> = {}): ClientDirectoryEntry {
  return {
    id: "user_1",
    name: "Maria Papadopoulos",
    email: "maria@example.com",
    phone: "+30 210 000 0000",
    nationality: "Greek",
    property: "Aegean Court",
    joinedDate: "1 Jan 2026",
    visa: { completed: 2, total: 5 },
    rental: { completed: 0, total: 10 },
    outstanding: 15000,
    ...overrides,
  };
}

const CLIENTS = [
  makeClient(),
  makeClient({
    id: "user_2",
    name: "Li Wei",
    email: "li@example.com",
    nationality: "Chinese",
    property: null,
    visa: { completed: 5, total: 5 },
    outstanding: 0,
  }),
  makeClient({
    id: "user_3",
    name: "Ahmed Hassan",
    email: "ahmed@example.com",
    nationality: "Egyptian",
    property: "Villa Elytra",
    visa: { completed: 0, total: 0 },
    outstanding: 42000,
  }),
];

beforeEach(() => {
  mockedSave.mockReset().mockResolvedValue(undefined);
  mockedDelete.mockReset().mockResolvedValue(undefined);
});

describe("filtering the roster", () => {
  it("shows every client by default", () => {
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    expect(screen.getByText("Maria Papadopoulos")).toBeInTheDocument();
    expect(screen.getByText("Li Wei")).toBeInTheDocument();
    expect(screen.getByText("3 rows")).toBeInTheDocument();
  });

  it("narrows by search across name, email and property", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    await user.type(screen.getByLabelText("Search this table"), "elytra");

    expect(screen.getByText("Ahmed Hassan")).toBeInTheDocument();
    expect(screen.queryByText("Maria Papadopoulos")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("distinguishes 'nothing matches' from 'you have no clients'", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    await user.type(screen.getByLabelText("Search this table"), "zzzznobody");

    // The two look identical on screen and mean completely different things.
    expect(screen.getByText(/No clients match these filters/)).toBeInTheDocument();
    expect(screen.queryByText(/No clients yet/)).not.toBeInTheDocument();
  });

  it("clears filters from the empty-state prompt", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    await user.type(screen.getByLabelText("Search this table"), "zzzznobody");
    await user.click(screen.getByRole("button", { name: "Clear them" }));

    expect(screen.getByText("Maria Papadopoulos")).toBeInTheDocument();
  });

  it("filters on a client with no property, which is a real thing to look for", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.selectOptions(screen.getByLabelText("Filter column"), "property");
    await user.selectOptions(screen.getByLabelText("Filter condition"), "isEmpty");
    await user.click(screen.getByRole("button", { name: "Add filter" }));

    expect(screen.getByText("Li Wei")).toBeInTheDocument();
    expect(screen.queryByText("Maria Papadopoulos")).not.toBeInTheDocument();
  });

  it("exposes derived visa status as a filterable column", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.selectOptions(screen.getByLabelText("Filter column"), "visaStatus");
    await user.selectOptions(screen.getByLabelText("Filter value"), "NOT_STARTED");
    await user.click(screen.getByRole("button", { name: "Add filter" }));

    // Ahmed has 0 of 0 steps — not started, as distinct from stalled at zero.
    expect(screen.getByText("Ahmed Hassan")).toBeInTheDocument();
    expect(screen.queryByText("Li Wei")).not.toBeInTheDocument();
  });
});

describe("grouping", () => {
  it("splits the roster into labelled groups with counts", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    await user.selectOptions(screen.getByLabelText("Group by"), "nationality");

    expect(screen.getByRole("heading", { name: /Greek/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Chinese/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Egyptian/ })).toBeInTheDocument();
  });

  it("puts clients with no value in a trailing '—' group rather than dropping them", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    await user.selectOptions(screen.getByLabelText("Group by"), "property");

    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings.at(-1)).toMatch(/—/);
  });
});

describe("saved views", () => {
  const SAVED = [
    { id: "v1", name: "Owing money", scope: "clients", config: { ...EMPTY_VIEW, search: "maria" } },
  ];

  it("offers no save button until the view actually does something", () => {
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    // A saved view that restores "no filters, no sort" is a button that does
    // nothing.
    expect(screen.queryByRole("button", { name: /Save this view/ })).not.toBeInTheDocument();
  });

  it("offers saving once a filter is applied", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    await user.type(screen.getByLabelText("Search this table"), "maria");

    expect(screen.getByRole("button", { name: /Save this view/ })).toBeInTheDocument();
  });

  it("saves the current config under a name", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    await user.type(screen.getByLabelText("Search this table"), "maria");
    await user.click(screen.getByRole("button", { name: /Save this view/ }));
    await user.type(screen.getByLabelText("Name this view"), "Marias");
    await user.click(screen.getByRole("button", { name: "Save view" }));

    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith(
        "clients",
        "Marias",
        expect.objectContaining({ search: "maria" }),
      ),
    );
  });

  it("applies a saved view when its chip is clicked", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={SAVED} />);

    await user.click(screen.getByRole("button", { name: "Apply saved view: Owing money" }));

    expect(screen.getByText("Maria Papadopoulos")).toBeInTheDocument();
    expect(screen.queryByText("Li Wei")).not.toBeInTheDocument();
  });

  it("detaches from a saved view once it is edited", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={SAVED} />);

    await user.click(screen.getByRole("button", { name: "Apply saved view: Owing money" }));
    await user.type(screen.getByLabelText("Search this table"), "x");

    // The chip must stop looking selected — what is on screen is no longer
    // what is saved, and pretending otherwise is the dishonest option.
    const chip = screen.getByRole("button", { name: "Apply saved view: Owing money" });
    expect(chip.parentElement?.className).not.toMatch(/bg-aegean-600/);
  });

  it("deletes a saved view", async () => {
    const user = userEvent.setup();
    render(<ClientRoster clients={CLIENTS} savedViews={SAVED} />);

    await user.click(screen.getByLabelText("Delete saved view: Owing money"));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith("v1"));
  });

  it("surfaces a failed save inline rather than throwing", async () => {
    const user = userEvent.setup();
    mockedSave.mockRejectedValueOnce(new Error("A saved view needs a name."));
    render(<ClientRoster clients={CLIENTS} savedViews={[]} />);

    await user.type(screen.getByLabelText("Search this table"), "maria");
    await user.click(screen.getByRole("button", { name: /Save this view/ }));
    await user.type(screen.getByLabelText("Name this view"), "X");
    await user.click(screen.getByRole("button", { name: "Save view" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/needs a name/);
  });
});
