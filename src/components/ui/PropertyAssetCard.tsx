import { MapPin } from "lucide-react";
import type { Project } from "@/lib/projects";

export interface PropertyAssetCardProps {
  property: Project;
}

export function PropertyAssetCard({ property }: PropertyAssetCardProps) {
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-stone-200 bg-stone-0 p-6 shadow-sm">
        <h1 className="font-display text-2xl font-bold text-stone-900">{property.name}</h1>
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-aegean-600 hover:underline"
        >
          <MapPin size={14} aria-hidden="true" />
          {property.address}
        </a>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-stone-100 pt-5 sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500">Floor</div>
            <div className="mt-0.5 text-sm font-semibold text-stone-900">{property.floor}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500">Size</div>
            <div className="mt-0.5 text-sm font-semibold text-stone-900">{property.sqm} m²</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500">Energy class</div>
            <div className="mt-0.5 text-sm font-semibold text-stone-900">{property.energyClass}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500">Delivery date</div>
            <div className="mt-0.5 text-sm font-semibold text-stone-900">{property.deliveryDate}</div>
          </div>
        </div>
      </div>

      <div className="aspect-video w-full max-w-4xl overflow-hidden rounded-lg border border-stone-200 shadow-sm">
        <iframe
          src={property.pptUrl ?? undefined}
          title={`${property.name} presentation`}
          className="h-full w-full"
          loading="lazy"
          referrerPolicy="no-referrer"
          allowFullScreen
        />
      </div>
    </div>
  );
}
