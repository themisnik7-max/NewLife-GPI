import { describe, expect, it } from "vitest";

import {
  EMPTY_VIEW,
  applyView,
  groupRows,
  isViewActive,
  matchesFilter,
  matchesSearch,
  parseViewConfig,
  sortRows,
  type ColumnDefinition,
  type ViewConfig,
} from "@/lib/views";

interface Client {
  name: string;
  email: string;
  status: string;
  salePrice: number | null;
  active: boolean;
}

const COLUMNS: ColumnDefinition<Client>[] = [
  { key: "name", label: "Name", accessor: (r) => r.name, type: "text", searchable: true },
  { key: "email", label: "Email", accessor: (r) => r.email, type: "text", searchable: true },
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
  { key: "salePrice", label: "Sale price", accessor: (r) => r.salePrice, type: "number" },
  { key: "active", label: "Active", accessor: (r) => r.active, type: "boolean" },
];

const ROWS: Client[] = [
  { name: "Maria Papadopoulos", email: "maria@example.com", status: "ACTIVE", salePrice: 250000, active: true },
  { name: "Li Wei", email: "li@example.com", status: "CLOSED", salePrice: 180000, active: false },
  { name: "Ahmed Hassan", email: "ahmed@example.com", status: "ACTIVE", salePrice: null, active: true },
];

function view(overrides: Partial<ViewConfig> = {}): ViewConfig {
  return { ...EMPTY_VIEW, ...overrides };
}

describe("matchesSearch", () => {
  it("matches any searchable column, case-insensitively", () => {
    expect(matchesSearch(ROWS[0], "maria", COLUMNS)).toBe(true);
    expect(matchesSearch(ROWS[0], "MARIA@EXAMPLE", COLUMNS)).toBe(true);
  });

  it("ignores columns not marked searchable", () => {
    // Status is not searchable, so typing "ACTIVE" must not match every row.
    expect(matchesSearch(ROWS[0], "ACTIVE", COLUMNS)).toBe(false);
  });

  it("matches everything when the term is blank or whitespace", () => {
    expect(matchesSearch(ROWS[0], "", COLUMNS)).toBe(true);
    expect(matchesSearch(ROWS[0], "   ", COLUMNS)).toBe(true);
  });
});

describe("matchesFilter", () => {
  it("handles is / isNot / contains", () => {
    expect(matchesFilter(ROWS[0], { columnKey: "status", operator: "is", value: "ACTIVE" }, COLUMNS)).toBe(true);
    expect(matchesFilter(ROWS[0], { columnKey: "status", operator: "isNot", value: "ACTIVE" }, COLUMNS)).toBe(false);
    expect(matchesFilter(ROWS[0], { columnKey: "name", operator: "contains", value: "papa" }, COLUMNS)).toBe(true);
  });

  it("treats null and empty string alike for isEmpty", () => {
    expect(matchesFilter(ROWS[2], { columnKey: "salePrice", operator: "isEmpty" }, COLUMNS)).toBe(true);
    expect(matchesFilter(ROWS[0], { columnKey: "salePrice", operator: "isEmpty" }, COLUMNS)).toBe(false);
    expect(matchesFilter(ROWS[0], { columnKey: "salePrice", operator: "isNotEmpty" }, COLUMNS)).toBe(true);
  });

  it("compares numbers numerically, not as text", () => {
    // "90000" > "250000" lexicographically; the engine must not think so.
    expect(matchesFilter(ROWS[0], { columnKey: "salePrice", operator: "gt", value: "90000" }, COLUMNS)).toBe(true);
    expect(matchesFilter(ROWS[1], { columnKey: "salePrice", operator: "lt", value: "200000" }, COLUMNS)).toBe(true);
  });

  it("excludes empty values from greater/less comparisons", () => {
    // An unknown sale price is not "less than everything".
    expect(matchesFilter(ROWS[2], { columnKey: "salePrice", operator: "lt", value: "999999" }, COLUMNS)).toBe(false);
  });

  it("passes the row through for a column that no longer exists", () => {
    // A stale saved view should degrade to showing everything, which is a
    // visible oddity, rather than showing nothing, which looks like "no data".
    expect(matchesFilter(ROWS[0], { columnKey: "removedColumn", operator: "is", value: "x" }, COLUMNS)).toBe(true);
  });
});

describe("sortRows", () => {
  it("sorts text naturally in both directions", () => {
    expect(sortRows(ROWS, "name", "asc", COLUMNS).map((r) => r.name)[0]).toBe("Ahmed Hassan");
    expect(sortRows(ROWS, "name", "desc", COLUMNS).map((r) => r.name)[0]).toBe("Maria Papadopoulos");
  });

  it("keeps rows with no value last in BOTH directions", () => {
    // Reversing the sort must not promote "unknown" to the top — an unknown
    // sale price is neither the cheapest nor the most expensive.
    expect(sortRows(ROWS, "salePrice", "asc", COLUMNS).at(-1)?.name).toBe("Ahmed Hassan");
    expect(sortRows(ROWS, "salePrice", "desc", COLUMNS).at(-1)?.name).toBe("Ahmed Hassan");
  });

  it("returns rows untouched for no sort key or an unknown column", () => {
    expect(sortRows(ROWS, null, "asc", COLUMNS)).toEqual(ROWS);
    expect(sortRows(ROWS, "nope", "asc", COLUMNS)).toEqual(ROWS);
  });

  it("does not mutate the input array", () => {
    const order = ROWS.map((r) => r.name);
    sortRows(ROWS, "name", "desc", COLUMNS);
    expect(ROWS.map((r) => r.name)).toEqual(order);
  });
});

describe("groupRows", () => {
  it("buckets rows by the group column and uses the option label", () => {
    const groups = groupRows(ROWS, "status", COLUMNS)!;

    expect(groups.map((g) => g.label)).toEqual(["Active", "Closed"]);
    expect(groups[0].rows).toHaveLength(2);
  });

  it("returns null when no group column is selected", () => {
    expect(groupRows(ROWS, null, COLUMNS)).toBeNull();
  });

  it("collects valueless rows into a trailing '—' bucket rather than dropping them", () => {
    // A client with no assigned property is exactly the row someone grouping
    // by property is looking for.
    const groups = groupRows(ROWS, "salePrice", COLUMNS)!;

    expect(groups.at(-1)!.label).toBe("—");
    expect(groups.at(-1)!.rows.map((r) => r.name)).toEqual(["Ahmed Hassan"]);
  });
});

describe("applyView", () => {
  it("combines multiple filters with AND", () => {
    const result = applyView(
      ROWS,
      view({
        filters: [
          { columnKey: "status", operator: "is", value: "ACTIVE" },
          { columnKey: "salePrice", operator: "isNotEmpty" },
        ],
      }),
      COLUMNS,
    );

    expect(result.rows.map((r) => r.name)).toEqual(["Maria Papadopoulos"]);
  });

  it("applies search and filters together", () => {
    const result = applyView(
      ROWS,
      view({ search: "example.com", filters: [{ columnKey: "status", operator: "is", value: "CLOSED" }] }),
      COLUMNS,
    );

    expect(result.rows.map((r) => r.name)).toEqual(["Li Wei"]);
  });

  it("reports both counts so the toolbar can say '1 of 3'", () => {
    const result = applyView(ROWS, view({ search: "maria" }), COLUMNS);

    expect(result.totalCount).toBe(3);
    expect(result.visibleCount).toBe(1);
  });

  it("groups the already-sorted rows, so each group is in order", () => {
    const result = applyView(ROWS, view({ sortKey: "name", sortDirection: "asc", groupKey: "status" }), COLUMNS);

    const active = result.groups!.find((g) => g.key === "ACTIVE")!;
    expect(active.rows.map((r) => r.name)).toEqual(["Ahmed Hassan", "Maria Papadopoulos"]);
  });

  it("returns everything unchanged for an empty view", () => {
    const result = applyView(ROWS, EMPTY_VIEW, COLUMNS);

    expect(result.rows).toEqual(ROWS);
    expect(result.groups).toBeNull();
  });
});

describe("isViewActive", () => {
  it("is false only for a genuinely untouched view", () => {
    expect(isViewActive(EMPTY_VIEW)).toBe(false);
    expect(isViewActive(view({ search: "x" }))).toBe(true);
    expect(isViewActive(view({ sortKey: "name" }))).toBe(true);
    expect(isViewActive(view({ groupKey: "status" }))).toBe(true);
    expect(isViewActive(view({ filters: [{ columnKey: "status", operator: "isEmpty" }] }))).toBe(true);
  });
});

describe("parseViewConfig", () => {
  it("round-trips a well-formed config", () => {
    const config = view({ search: "maria", sortKey: "name", sortDirection: "desc", groupKey: "status" });

    expect(parseViewConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
  });

  it("falls back to an empty view for junk", () => {
    expect(parseViewConfig(null)).toEqual(EMPTY_VIEW);
    expect(parseViewConfig("not an object")).toEqual(EMPTY_VIEW);
    expect(parseViewConfig(42)).toEqual(EMPTY_VIEW);
  });

  it("drops malformed filters instead of throwing", () => {
    // A stored view can hold anything ever written to it, including a config
    // from an older shape of the app.
    const parsed = parseViewConfig({
      search: "x",
      filters: [
        { columnKey: "status", operator: "is", value: "ACTIVE" },
        { columnKey: "status", operator: "explode" },
        null,
        "nonsense",
      ],
    });

    expect(parsed.filters).toEqual([{ columnKey: "status", operator: "is", value: "ACTIVE" }]);
  });

  it("normalises an unexpected sort direction to ascending", () => {
    expect(parseViewConfig({ sortDirection: "sideways" }).sortDirection).toBe("asc");
  });
});
