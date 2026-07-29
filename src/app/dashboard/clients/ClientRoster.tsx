"use client";

import { useMemo, useState } from "react";
import { Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
import { ClientDirectory } from "@/components/ui/ClientDirectory";
import { ViewToolbar } from "@/components/ui/ViewToolbar";
import {
  EMPTY_VIEW,
  applyView,
  isViewActive,
  type ColumnDefinition,
  type ViewConfig,
} from "@/lib/views";
import { useAdminAction, AdminError } from "@/components/ui/adminControls";
import type { ClientDirectoryEntry } from "@/lib/data/clients";
import type { SavedViewSummary } from "@/lib/data/savedViews";
import { deleteSavedViewAction, saveViewAction } from "./actions";

/**
 * The client roster with monday's board controls on top: search, stacked
 * filters, sort, group, and named saved views.
 *
 * The view state lives here rather than in ViewToolbar because three things
 * need it — the toolbar, the table, and the save/restore controls — and a
 * toolbar that owned it could not be told to load a saved view.
 *
 * SCOPE ("clients") is passed to every saved-view call and is what keeps one
 * table's views out of another's list. It is a plain string on purpose; see
 * the SavedView model comment.
 */

const VIEW_SCOPE = "clients";

/**
 * Columns are declared here, not in ClientDirectory, because they describe
 * how a row is *queried* — searched, filtered, sorted, grouped — which is a
 * different concern from how it is rendered. Keeping them apart is what lets
 * a column be filterable without being a visible table column, and vice
 * versa.
 *
 * Every accessor returns null rather than a placeholder for missing data:
 * null is what isEmpty tests and what sorts last, so "no property assigned"
 * stays findable and never pretends to be the alphabetically-first value.
 */
const COLUMNS: ColumnDefinition<ClientDirectoryEntry>[] = [
  { key: "name", label: "Name", accessor: (row) => row.name, type: "text", searchable: true },
  { key: "email", label: "Email", accessor: (row) => row.email, type: "text", searchable: true },
  {
    key: "phone",
    label: "Phone",
    accessor: (row) => row.phone,
    type: "text",
    searchable: true,
  },
  {
    key: "nationality",
    label: "Nationality",
    accessor: (row) => row.nationality,
    type: "text",
    searchable: true,
    groupable: true,
  },
  {
    key: "property",
    label: "Property",
    accessor: (row) => row.property,
    type: "text",
    searchable: true,
    groupable: true,
  },
  {
    key: "outstanding",
    label: "Outstanding",
    accessor: (row) => row.outstanding,
    type: "number",
  },
  {
    // Derived, not stored: "how far through the visa process" is a ratio the
    // roster already computes for display, and exposing it as a filterable
    // column costs nothing beyond this accessor.
    key: "visaProgress",
    label: "Visa steps done",
    accessor: (row) => row.visa.completed,
    type: "number",
  },
  {
    key: "rentalProgress",
    label: "Rental stages done",
    accessor: (row) => row.rental.completed,
    type: "number",
  },
  {
    key: "visaStatus",
    label: "Visa status",
    accessor: (row) =>
      row.visa.total === 0
        ? "NOT_STARTED"
        : row.visa.completed >= row.visa.total
          ? "COMPLETE"
          : "IN_PROGRESS",
    type: "enum",
    groupable: true,
    options: [
      { value: "NOT_STARTED", label: "Not started" },
      { value: "IN_PROGRESS", label: "In progress" },
      { value: "COMPLETE", label: "Complete" },
    ],
  },
];

export interface ClientRosterProps {
  clients: ClientDirectoryEntry[];
  savedViews: SavedViewSummary[];
}

export function ClientRoster({ clients, savedViews }: ClientRosterProps) {
  const [config, setConfig] = useState<ViewConfig>(EMPTY_VIEW);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [isNaming, setIsNaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const { error, isPending, run } = useAdminAction();

  // Recomputed only when the rows or the view actually change — the pipeline
  // runs on every render otherwise, and it sorts.
  const result = useMemo(() => applyView(clients, config, COLUMNS), [clients, config]);

  function loadView(view: SavedViewSummary): void {
    setConfig(view.config);
    setActiveViewId(view.id);
  }

  function changeConfig(next: ViewConfig): void {
    setConfig(next);
    // Editing a loaded view detaches from it rather than silently
    // reinterpreting the saved one — the chip stops looking selected, which
    // is the honest signal that what is on screen is no longer what is saved.
    setActiveViewId(null);
  }

  function handleSave(): void {
    const name = draftName.trim();
    if (!name) return;
    run(() => saveViewAction(VIEW_SCOPE, name, config), () => {
      setDraftName("");
      setIsNaming(false);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {savedViews.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {savedViews.map((view) => (
            <span
              key={view.id}
              className={`inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs font-medium transition-colors ${
                view.id === activeViewId
                  ? "bg-aegean-600 text-white"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              {/* Labelled explicitly rather than relying on the visible name:
              the chip holds two controls, and "Owing money" alone does not
              tell a screen-reader user whether it applies or deletes. */}
              <button
                type="button"
                onClick={() => loadView(view)}
                aria-label={`Apply saved view: ${view.name}`}
                className="inline-flex items-center gap-1"
              >
                <Bookmark size={11} aria-hidden="true" />
                {view.name}
              </button>
              <button
                type="button"
                onClick={() => run(() => deleteSavedViewAction(view.id))}
                disabled={isPending}
                aria-label={`Delete saved view: ${view.name}`}
                className="rounded-full p-0.5 transition-colors hover:bg-black/10 disabled:opacity-60"
              >
                <Trash2 size={11} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <AdminError message={error} />

      <ViewToolbar
        columns={COLUMNS}
        config={config}
        onChange={changeConfig}
        visibleCount={result.visibleCount}
        totalCount={result.totalCount}
        searchPlaceholder="Search name, email, phone, property…"
      />

      {/* Saving is offered only once the view does something — a saved view
      that restores "no filters, no sort" is a button that does nothing. */}
      {isViewActive(config) &&
        (isNaming ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSave();
                }
                if (event.key === "Escape") setIsNaming(false);
              }}
              placeholder="Name this view"
              aria-label="Name this view"
              autoFocus
              className="rounded-md border border-stone-300 bg-stone-0 px-2.5 py-1.5 text-sm focus:border-aegean-500 focus:outline-none focus:ring-2 focus:ring-aegean-100"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !draftName.trim()}
              className="rounded-md bg-aegean-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-aegean-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save view
            </button>
            <button
              type="button"
              onClick={() => setIsNaming(false)}
              className="text-sm text-stone-500 hover:text-stone-800"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsNaming(true)}
            className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-aegean-600 hover:text-aegean-700"
          >
            <BookmarkPlus size={13} aria-hidden="true" />
            Save this view
          </button>
        ))}

      {result.groups ? (
        <div className="flex flex-col gap-4">
          {result.groups.map((group) => (
            <div key={group.key}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                {group.label}
                <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
                  {group.rows.length}
                </span>
              </h3>
              <ClientDirectory clients={group.rows} />
            </div>
          ))}
        </div>
      ) : result.visibleCount === 0 && result.totalCount > 0 ? (
        // Distinguished from ClientDirectory's own "no clients yet" message:
        // "nothing matches your filters" and "you have no clients" look
        // identical on screen and mean completely different things.
        <p className="text-sm text-stone-500">
          No clients match these filters.{" "}
          <button
            type="button"
            onClick={() => changeConfig(EMPTY_VIEW)}
            className="font-semibold text-aegean-600 hover:underline"
          >
            Clear them
          </button>
          .
        </p>
      ) : (
        <ClientDirectory clients={result.rows} />
      )}
    </div>
  );
}
