"use client";

import { useState } from "react";
import { ArrowUpDown, Filter, Group, Search, X } from "lucide-react";
import {
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  isViewActive,
  type ColumnDefinition,
  type FilterCondition,
  type FilterOperator,
  type ViewConfig,
} from "@/lib/views";

/**
 * The filter/sort/group bar that sits above a table — monday's board toolbar,
 * reduced to the controls that earn their place here.
 *
 * Fully controlled: it owns no view state, only the "add a filter" draft that
 * exists between opening the popover and committing a condition. The page
 * owns the ViewConfig so it can also be saved, restored from a saved view, or
 * shared between a table and a summary line without two sources of truth.
 *
 * Operators come from OPERATORS_BY_TYPE rather than a fixed list, so the bar
 * cannot offer "greater than" on a boolean or "contains" on an enum.
 */

const CONTROL_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-stone-0 px-2.5 py-1.5 text-sm text-stone-700 transition-colors hover:bg-stone-50";

export interface ViewToolbarProps<Row> {
  columns: readonly ColumnDefinition<Row>[];
  config: ViewConfig;
  onChange: (next: ViewConfig) => void;
  /** "3 of 12" — supplied by the page, which has already run applyView. */
  visibleCount: number;
  totalCount: number;
  searchPlaceholder?: string;
}

export function ViewToolbar<Row>({
  columns,
  config,
  onChange,
  visibleCount,
  totalCount,
  searchPlaceholder = "Search…",
}: ViewToolbarProps<Row>) {
  const [isAddingFilter, setIsAddingFilter] = useState(false);
  const [draftColumn, setDraftColumn] = useState(columns[0]?.key ?? "");
  const [draftOperator, setDraftOperator] = useState<FilterOperator>("contains");
  const [draftValue, setDraftValue] = useState("");

  const groupableColumns = columns.filter((column) => column.groupable);
  const selectedDraftColumn = columns.find((column) => column.key === draftColumn);
  const availableOperators = selectedDraftColumn
    ? OPERATORS_BY_TYPE[selectedDraftColumn.type]
    : (["contains"] as FilterOperator[]);
  // isEmpty/isNotEmpty test for absence, so a value input would be
  // meaningless — the form hides it rather than collecting something ignored.
  const needsValue = draftOperator !== "isEmpty" && draftOperator !== "isNotEmpty";

  function commitFilter(): void {
    if (!draftColumn) return;
    if (needsValue && !draftValue.trim()) return;

    const condition: FilterCondition = {
      columnKey: draftColumn,
      operator: draftOperator,
      ...(needsValue ? { value: draftValue.trim() } : {}),
    };

    onChange({ ...config, filters: [...config.filters, condition] });
    setDraftValue("");
    setIsAddingFilter(false);
  }

  function removeFilter(index: number): void {
    onChange({ ...config, filters: config.filters.filter((_, i) => i !== index) });
  }

  function labelForFilter(condition: FilterCondition): string {
    const column = columns.find((candidate) => candidate.key === condition.columnKey);
    // A filter on a column that has since been removed still renders, using
    // its raw key — the engine already passes those rows through, and showing
    // the chip is what lets someone delete it.
    const columnLabel = column?.label ?? condition.columnKey;
    const optionLabel = column?.options?.find((o) => o.value === condition.value)?.label;
    const value = optionLabel ?? condition.value ?? "";
    return `${columnLabel} ${OPERATOR_LABELS[condition.operator]}${value ? ` ${value}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={config.search}
            onChange={(event) => onChange({ ...config, search: event.target.value })}
            placeholder={searchPlaceholder}
            aria-label="Search this table"
            className="w-full rounded-md border border-stone-200 bg-stone-0 py-1.5 pl-8 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-aegean-500 focus:outline-none focus:ring-2 focus:ring-aegean-100"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsAddingFilter((current) => !current)}
          aria-expanded={isAddingFilter}
          className={CONTROL_CLASS}
        >
          <Filter size={14} aria-hidden="true" />
          Filter
        </button>

        <label className={`${CONTROL_CLASS} cursor-pointer`}>
          <ArrowUpDown size={14} aria-hidden="true" />
          <span className="sr-only">Sort by</span>
          <select
            value={config.sortKey ?? ""}
            onChange={(event) =>
              onChange({ ...config, sortKey: event.target.value || null })
            }
            aria-label="Sort by"
            className="cursor-pointer bg-transparent focus:outline-none"
          >
            <option value="">Sort</option>
            {columns.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </select>
        </label>

        {config.sortKey && (
          <button
            type="button"
            onClick={() =>
              onChange({ ...config, sortDirection: config.sortDirection === "asc" ? "desc" : "asc" })
            }
            aria-label={`Sort ${config.sortDirection === "asc" ? "descending" : "ascending"}`}
            className={CONTROL_CLASS}
          >
            {config.sortDirection === "asc" ? "A→Z" : "Z→A"}
          </button>
        )}

        {groupableColumns.length > 0 && (
          <label className={`${CONTROL_CLASS} cursor-pointer`}>
            <Group size={14} aria-hidden="true" />
            <span className="sr-only">Group by</span>
            <select
              value={config.groupKey ?? ""}
              onChange={(event) => onChange({ ...config, groupKey: event.target.value || null })}
              aria-label="Group by"
              className="cursor-pointer bg-transparent focus:outline-none"
            >
              <option value="">Group</option>
              {groupableColumns.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <span className="ml-auto text-xs text-stone-500">
          {visibleCount === totalCount
            ? `${totalCount} ${totalCount === 1 ? "row" : "rows"}`
            : `${visibleCount} of ${totalCount}`}
        </span>
      </div>

      {isAddingFilter && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-stone-200 bg-stone-50 p-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
            Column
            <select
              value={draftColumn}
              onChange={(event) => {
                setDraftColumn(event.target.value);
                const next = columns.find((column) => column.key === event.target.value);
                // Reset the operator to one this column actually supports,
                // otherwise switching from a text to a boolean column leaves
                // "contains" selected and silently matching nothing.
                if (next) setDraftOperator(OPERATORS_BY_TYPE[next.type][0]);
                setDraftValue("");
              }}
              aria-label="Filter column"
              className="rounded-md border border-stone-300 bg-stone-0 px-2 py-1.5 text-sm"
            >
              {columns.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
            Condition
            <select
              value={draftOperator}
              onChange={(event) => setDraftOperator(event.target.value as FilterOperator)}
              aria-label="Filter condition"
              className="rounded-md border border-stone-300 bg-stone-0 px-2 py-1.5 text-sm"
            >
              {availableOperators.map((operator) => (
                <option key={operator} value={operator}>
                  {OPERATOR_LABELS[operator]}
                </option>
              ))}
            </select>
          </label>

          {needsValue && (
            <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
              Value
              {selectedDraftColumn?.options ? (
                <select
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  aria-label="Filter value"
                  className="rounded-md border border-stone-300 bg-stone-0 px-2 py-1.5 text-sm"
                >
                  <option value="">Choose…</option>
                  {selectedDraftColumn.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={selectedDraftColumn?.type === "number" ? "number" : "text"}
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitFilter();
                    }
                  }}
                  aria-label="Filter value"
                  className="rounded-md border border-stone-300 bg-stone-0 px-2 py-1.5 text-sm"
                />
              )}
            </label>
          )}

          <button
            type="button"
            onClick={commitFilter}
            className="rounded-md bg-aegean-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-aegean-700"
          >
            Add filter
          </button>
        </div>
      )}

      {(config.filters.length > 0 || isViewActive(config)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {config.filters.map((condition, index) => (
            <span
              key={`${condition.columnKey}-${condition.operator}-${index}`}
              className="inline-flex items-center gap-1 rounded-full bg-aegean-50 py-1 pl-2.5 pr-1 text-xs font-medium text-aegean-800"
            >
              {labelForFilter(condition)}
              <button
                type="button"
                onClick={() => removeFilter(index)}
                aria-label={`Remove filter: ${labelForFilter(condition)}`}
                className="rounded-full p-0.5 transition-colors hover:bg-aegean-100"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={() =>
              onChange({ search: "", filters: [], sortKey: null, sortDirection: "asc", groupKey: null })
            }
            className="text-xs font-semibold text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
