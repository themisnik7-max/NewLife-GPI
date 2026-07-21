"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, Table as TableIcon } from "lucide-react";
import type { Project } from "@/lib/projects";

export interface ProjectsExplorerProps {
  /**
   * Required, not defaulted to mock data: this component no longer imports
   * MOCK_PROJECTS itself (src/lib/projects.ts exports only client-safe
   * types/mocks; real data comes from src/lib/data/projects.ts, which is
   * server-only and cannot be imported here). Callers — the Server
   * Component pages — fetch real data and pass it down.
   */
  projects: Project[];
}

type ViewMode = "table" | "grid";

export function ProjectsExplorer({ projects }: ProjectsExplorerProps) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const isGrid = view === "grid";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(q) ||
        project.address.toLowerCase().includes(q) ||
        project.area.toLowerCase().includes(q)
    );
  }, [projects, query]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, address, or area…"
          aria-label="Search projects"
          className="w-full max-w-sm rounded-md border border-stone-300 bg-stone-0 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-aegean-500 focus:outline-none focus:ring-2 focus:ring-aegean-100"
        />

        <button
          type="button"
          role="switch"
          aria-checked={isGrid}
          aria-label="Toggle between table view and slot view"
          onClick={() => setView((current) => (current === "table" ? "grid" : "table"))}
          className="flex items-center gap-1 rounded-full border border-stone-300 bg-stone-0 p-1 text-sm font-medium"
        >
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
              !isGrid ? "bg-aegean-500 text-white" : "text-stone-500"
            }`}
          >
            <TableIcon size={14} aria-hidden="true" />
            Table View
          </span>
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
              isGrid ? "bg-aegean-500 text-white" : "text-stone-500"
            }`}
          >
            <LayoutGrid size={14} aria-hidden="true" />
            Slot View
          </span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-stone-500">No projects match your search.</p>
      ) : isGrid ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="projects-grid"
        >
          {filtered.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="font-semibold text-stone-900">{project.name}</span>
              <span className="text-sm text-stone-600">{project.address}</span>
              <span className="text-xs uppercase tracking-wide text-stone-500">{project.area}</span>
              <span className="mt-2 text-sm text-stone-700">
                {project.availableUnits} of {project.totalUnits} units available
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-0 shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <th scope="col" className="px-5 py-3">
                  Name
                </th>
                <th scope="col" className="px-5 py-3">
                  Address
                </th>
                <th scope="col" className="px-5 py-3">
                  Area
                </th>
                <th scope="col" className="px-5 py-3">
                  Available
                </th>
                <th scope="col" className="px-5 py-3">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <tr key={project.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-5 py-4 font-medium text-stone-900">{project.name}</td>
                  <td className="px-5 py-4 text-stone-700">{project.address}</td>
                  <td className="px-5 py-4 text-stone-500">{project.area}</td>
                  <td className="px-5 py-4 text-stone-700">
                    {project.availableUnits} / {project.totalUnits}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className="rounded-md px-3 py-1.5 text-sm font-semibold text-aegean-600 transition-colors hover:bg-aegean-50"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
