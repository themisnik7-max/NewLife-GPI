import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewToolbar } from "@/components/ui/ViewToolbar";
import { EMPTY_VIEW, type ColumnDefinition, type ViewConfig } from "@/lib/views";

interface Row {
  name: string;
  status: string;
  amount: number;
  flagged: boolean;
}

const COLUMNS: ColumnDefinition<Row>[] = [
  { key: "name", label: "Name", accessor: (r) => r.name, type: "text", searchable: true },
  {
    key: "status",
    label: "Status",
    accessor: (r) => r.status,
    type: "enum",
    groupable: true,
    options: [
      { value: "ACTIVE", label: "Active" },
      { value: "CLOSED", label: "Closed" },
    ],
  },
  { key: "amount", label: "Amount", accessor: (r) => r.amount, type: "number" },
  { key: "flagged", label: "Flagged", accessor: (r) => r.flagged, type: "boolean" },
];

const onChange = vi.fn();

function renderToolbar(config: Partial<ViewConfig> = {}) {
  return render(
    <ViewToolbar
      columns={COLUMNS}
      config={{ ...EMPTY_VIEW, ...config }}
      onChange={onChange}
      visibleCount={3}
      totalCount={10}
    />,
  );
}

beforeEach(() => {
  onChange.mockReset();
});

describe("counts", () => {
  it("says 'n of m' when a view is narrowing the list", () => {
    renderToolbar();
    expect(screen.getByText("3 of 10")).toBeInTheDocument();
  });

  it("says just the row count when nothing is filtered out", () => {
    render(
      <ViewToolbar
        columns={COLUMNS}
        config={EMPTY_VIEW}
        onChange={onChange}
        visibleCount={10}
        totalCount={10}
      />,
    );
    expect(screen.getByText("10 rows")).toBeInTheDocument();
  });

  it("uses the singular for one row", () => {
    render(
      <ViewToolbar columns={COLUMNS} config={EMPTY_VIEW} onChange={onChange} visibleCount={1} totalCount={1} />,
    );
    expect(screen.getByText("1 row")).toBeInTheDocument();
  });
});

describe("search", () => {
  it("reports every keystroke upward — the parent owns the state", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.type(screen.getByLabelText("Search this table"), "a");

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: "a" }));
  });
});

describe("sort", () => {
  it("offers every column and reports the choice", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.selectOptions(screen.getByLabelText("Sort by"), "amount");

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sortKey: "amount" }));
  });

  it("hides the direction toggle until a sort column is chosen", () => {
    renderToolbar();
    expect(screen.queryByRole("button", { name: /Sort desc|Sort asc/ })).not.toBeInTheDocument();
  });

  it("flips direction once a column is sorted", async () => {
    const user = userEvent.setup();
    renderToolbar({ sortKey: "name", sortDirection: "asc" });

    await user.click(screen.getByRole("button", { name: "Sort descending" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sortDirection: "desc" }));
  });
});

describe("group", () => {
  it("offers only groupable columns", () => {
    renderToolbar();

    const select = screen.getByLabelText("Group by");
    expect(within(select).getByRole("option", { name: "Status" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Amount" })).not.toBeInTheDocument();
  });
});

describe("filters", () => {
  it("offers only operators that make sense for the chosen column", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.selectOptions(screen.getByLabelText("Filter column"), "flagged");

    // "greater than" on a boolean is nonsense the toolbar must not offer.
    const condition = screen.getByLabelText("Filter condition");
    expect(within(condition).getByRole("option", { name: "is" })).toBeInTheDocument();
    expect(within(condition).queryByRole("option", { name: /greater than/ })).not.toBeInTheDocument();
  });

  it("resets the operator when switching to a column that does not support it", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    // Text starts on "contains"; boolean has no such operator, so leaving it
    // selected would silently match nothing.
    await user.selectOptions(screen.getByLabelText("Filter column"), "flagged");

    expect(screen.getByLabelText("Filter condition")).toHaveValue("is");
  });

  it("offers a dropdown of known values for an enum column", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.selectOptions(screen.getByLabelText("Filter column"), "status");

    const value = screen.getByLabelText("Filter value");
    expect(within(value).getByRole("option", { name: "Active" })).toBeInTheDocument();
  });

  it("hides the value input for operators that test absence", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.selectOptions(screen.getByLabelText("Filter condition"), "isEmpty");

    // Collecting a value that the engine ignores would be a lie.
    expect(screen.queryByLabelText("Filter value")).not.toBeInTheDocument();
  });

  it("commits a filter and reports it upward", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.type(screen.getByLabelText("Filter value"), "maria");
    await user.click(screen.getByRole("button", { name: "Add filter" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ columnKey: "name", operator: "contains", value: "maria" }],
      }),
    );
  });

  it("will not commit an empty value for an operator that needs one", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "Add filter" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders an active filter as a removable chip with a readable label", async () => {
    const user = userEvent.setup();
    renderToolbar({ filters: [{ columnKey: "status", operator: "is", value: "ACTIVE" }] });

    // The enum's label, not its stored value.
    expect(screen.getByText("Status is Active")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Remove filter: Status is Active"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ filters: [] }));
  });

  it("still renders a chip for a column that no longer exists, so it can be removed", () => {
    // The engine passes those rows through; showing the chip is what lets
    // someone clear a stale saved view rather than being stuck with it.
    renderToolbar({ filters: [{ columnKey: "removedColumn", operator: "is", value: "x" }] });

    expect(screen.getByText("removedColumn is x")).toBeInTheDocument();
  });

  it("clears everything at once", async () => {
    const user = userEvent.setup();
    renderToolbar({ search: "x", sortKey: "name", filters: [{ columnKey: "name", operator: "isEmpty" }] });

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(onChange).toHaveBeenCalledWith({
      search: "",
      filters: [],
      sortKey: null,
      sortDirection: "asc",
      groupKey: null,
    });
  });

  it("offers no clear button on an untouched view", () => {
    renderToolbar();
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });
});
