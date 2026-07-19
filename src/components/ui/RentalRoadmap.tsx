"use client";

import { useUser } from "@clerk/nextjs";

export const RENTAL_STAGES = [
  "Project Delivered",
  "Mandate Signed",
  "ID Photo",
  "Keys Received",
  "Property Inspected",
  "Energy Certificate Ready",
  "Marketing",
  "Tenant Interview & Selection",
  "Lease Agreement Signed",
  "Property Leased",
] as const;

type RentalStageStatus = "completed" | "active" | "pending";

function getRentalStageIndex(publicMetadata: Record<string, unknown> | null | undefined): number {
  const value = publicMetadata?.rentalStageIndex;
  return typeof value === "number" ? value : 0;
}

function getStageStatus(index: number, currentIndex: number): RentalStageStatus {
  if (index < currentIndex) return "completed";
  if (index === currentIndex) return "active";
  return "pending";
}

const STATUS_LABEL: Record<RentalStageStatus, string> = {
  completed: "Completed",
  active: "Active",
  pending: "Pending",
};

export function RentalRoadmap() {
  const { user } = useUser();
  const currentIndex = getRentalStageIndex(user?.publicMetadata);

  return (
    <ol className="flex flex-col">
      {RENTAL_STAGES.map((stage, index) => {
        const status = getStageStatus(index, currentIndex);
        const isLast = index === RENTAL_STAGES.length - 1;

        return (
          <li
            key={stage}
            aria-current={status === "active" ? "step" : undefined}
            className="flex gap-4"
          >
            <div className="flex flex-col items-center">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  status === "completed"
                    ? "bg-green-500 text-white"
                    : status === "active"
                      ? "animate-pulse bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {index + 1}
              </span>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`w-0.5 flex-1 ${status === "completed" ? "bg-green-500" : "bg-gray-200"}`}
                  style={{ minHeight: 28 }}
                />
              )}
            </div>
            <div className="pb-7">
              <div className="font-medium text-stone-900">{stage}</div>
              <span
                className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                  status === "completed"
                    ? "bg-green-50 text-green-700"
                    : status === "active"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {STATUS_LABEL[status]}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
