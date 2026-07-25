"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MilestoneEntry } from "@/lib/data/construction";
import {
  AdminError,
  AdminField,
  AdminSection,
  ADMIN_BUTTON_CLASS,
  ADMIN_FIELD_CLASS,
  useAdminAction,
} from "@/components/ui/adminControls";
import { createMilestoneAction, updateMilestoneStatusAction } from "../actions";

const MILESTONE_STATUSES: Array<{ value: MilestoneEntry["status"]; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
];

export interface MilestoneAdminPanelProps {
  propertyId: string;
  milestones: MilestoneEntry[];
}

/**
 * Admin-only construction-milestone editing, rendered additively alongside
 * the read-only ConstructionMilestones display — that component is left
 * untouched so its use on the client-facing /dashboard/construction page is
 * unaffected.
 */
export function MilestoneAdminPanel({ propertyId, milestones }: MilestoneAdminPanelProps) {
  const router = useRouter();
  const { error, isPending, run } = useAdminAction();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-bold text-stone-900">Construction milestones</h2>
        <p className="text-sm text-stone-500">Only administrators can see and use these controls.</p>
      </div>

      <AdminError message={error} />

      <AdminSection title="Milestones">
        {milestones.length > 0 ? (
          <ul className="mb-4 flex flex-col gap-2">
            {milestones.map((milestone) => (
              <li
                key={milestone.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-2 last:border-0"
              >
                <span className="text-sm text-stone-900">{milestone.title}</span>
                <select
                  aria-label={`Status for ${milestone.title}`}
                  className="rounded-md border border-stone-300 bg-stone-0 px-2 py-1 text-xs text-stone-900"
                  value={milestone.status}
                  disabled={isPending}
                  onChange={(e) =>
                    run(
                      () =>
                        updateMilestoneStatusAction(
                          propertyId,
                          milestone.id,
                          e.target.value as MilestoneEntry["status"],
                        ),
                      refresh,
                    )
                  }
                >
                  {MILESTONE_STATUSES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-stone-500">No milestones on record for this property yet.</p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <AdminField label="New milestone">
              <input
                className={ADMIN_FIELD_CLASS}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Foundation poured"
              />
            </AdminField>
          </div>
          <div className="min-w-[180px] flex-1">
            <AdminField label="Description (optional)">
              <input
                className={ADMIN_FIELD_CLASS}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </AdminField>
          </div>
          <div className="min-w-[150px]">
            <AdminField label="Target date">
              <input
                type="date"
                className={ADMIN_FIELD_CLASS}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </AdminField>
          </div>
          <button
            type="button"
            disabled={isPending || !title.trim() || !targetDate}
            onClick={() =>
              run(
                () => createMilestoneAction(propertyId, { title, description: description || null, targetDate }),
                () => {
                  setTitle("");
                  setDescription("");
                  setTargetDate("");
                  refresh();
                },
              )
            }
            className={ADMIN_BUTTON_CLASS}
          >
            Add milestone
          </button>
        </div>
      </AdminSection>
    </div>
  );
}
