"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { ProjectDetail } from "@/components/ui/ProjectDetail";
import { PropertyForm } from "@/components/ui/PropertyForm";
import type { Project } from "@/lib/projects";
import { updatePropertyAction } from "../actions";

export interface PropertyDetailWithEditProps {
  project: Project;
  isAdmin: boolean;
}

/**
 * Admin-only inline edit toggle on top of the existing read-only
 * ProjectDetail — ProjectDetail itself stays untouched so its non-admin
 * rendering is unaffected. router.refresh() after a successful save
 * re-fetches this Server Component's data (updatePropertyAction's own
 * revalidatePath only invalidates the cache; it doesn't itself push new
 * data into an already-mounted client tree).
 */
export function PropertyDetailWithEdit({ project, isAdmin }: PropertyDetailWithEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const router = useRouter();

  if (isEditing) {
    return (
      <PropertyForm
        submitLabel="Save Changes"
        initialValues={{
          name: project.name,
          address: project.address,
          area: project.area,
          totalUnits: String(project.totalUnits),
          availableUnits: String(project.availableUnits),
          deliveryDate: project.deliveryDate,
          contractDate: project.contractDate,
          floor: String(project.floor),
          sqm: String(project.sqm),
          energyClass: project.energyClass,
          status: project.status,
          listedForRental: project.listedForRental,
          imageUrl: project.imageUrl,
          mapUrl: project.mapUrl,
          pptUrl: project.pptUrl ?? "",
        }}
        onCancel={() => setIsEditing(false)}
        onSubmit={async (values) => {
          await updatePropertyAction(project.id, values);
          setIsEditing(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
          >
            <Pencil size={14} aria-hidden="true" />
            Edit
          </button>
        </div>
      )}
      <ProjectDetail project={project} />
    </div>
  );
}
