import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Project } from "@/lib/projects";

export interface ProjectDetailProps {
  project: Project;
}

const SPEC_ROWS: Array<[label: string, getValue: (project: Project) => string]> = [
  ["Address", (project) => project.address],
  ["Area", (project) => project.area],
  ["Total units", (project) => String(project.totalUnits)],
  ["Available units", (project) => String(project.availableUnits)],
  ["Floor", (project) => String(project.floor)],
  ["Size", (project) => `${project.sqm} m²`],
  ["Energy class", (project) => project.energyClass],
  ["Contract date", (project) => project.contractDate],
  ["Delivery date", (project) => project.deliveryDate],
];

export function ProjectDetail({ project }: ProjectDetailProps) {
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-stone-900">{project.name}</h1>
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-aegean-600 hover:underline"
        >
          <MapPin size={14} aria-hidden="true" />
          {project.address}
        </a>
      </div>

      <div className="rounded-lg border border-stone-200 bg-stone-0 shadow-sm">
        <dl className="grid grid-cols-1 divide-y divide-stone-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {SPEC_ROWS.map(([label, getValue]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <dt className="text-sm text-stone-500">{label}</dt>
              <dd className="text-sm font-semibold text-stone-900">{getValue(project)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="aspect-video w-full max-w-4xl overflow-hidden rounded-lg border border-stone-200 shadow-sm">
        <iframe
          src={project.pptUrl ?? undefined}
          title={`${project.name} presentation`}
          className="h-full w-full"
          loading="lazy"
          referrerPolicy="no-referrer"
          allowFullScreen
        />
      </div>

      <Link href="/dashboard/projects" className="text-sm font-medium text-aegean-600 hover:underline">
        ← Back to all projects
      </Link>
    </div>
  );
}
