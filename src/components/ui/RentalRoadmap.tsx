// Previously read the current step from Clerk's publicMetadata.rentalStageIndex
// and used 10 hardcoded labels ("Project Delivered" ... "Property Leased")
// that never matched prisma/schema.prisma's real RentalStage enum — flagged
// repeatedly across LOGS.md entries as a known mismatch, never fixed until
// now. Rental progress is real PropertyOwnership.rentalStage data, not
// Clerk metadata, so this is now a plain presentational component driven by
// a `currentStage` prop (matching ProjectsExplorer/PropertyAssetCard's
// established pattern) — no client-only hooks remain, so "use client" and
// the Clerk dependency are both gone.

export type RentalStage =
  | "RESERVATION"
  | "SPA_SIGNED"
  | "LEGAL_REVIEW"
  | "VENDORS_ENGAGED"
  | "VISA_SUBMISSION"
  | "VISA_APPROVED"
  | "CONSTRUCTION_START"
  | "INTERIOR_CHOICES"
  | "HANDOVER"
  | "RENTAL_ACTIVE";

// An ordered array, not a Record: display order must match the real
// business process's progression, and a Record<RentalStage, string> has no
// guaranteed key order to render from.
export const RENTAL_STAGES: ReadonlyArray<{ stage: RentalStage; label: string }> = [
  { stage: "RESERVATION", label: "Reservation" },
  { stage: "SPA_SIGNED", label: "SPA Signed" },
  { stage: "LEGAL_REVIEW", label: "Legal Review" },
  { stage: "VENDORS_ENGAGED", label: "Vendors Engaged" },
  { stage: "VISA_SUBMISSION", label: "Visa Submission" },
  { stage: "VISA_APPROVED", label: "Visa Approved" },
  { stage: "CONSTRUCTION_START", label: "Construction Start" },
  { stage: "INTERIOR_CHOICES", label: "Interior Choices" },
  { stage: "HANDOVER", label: "Handover" },
  { stage: "RENTAL_ACTIVE", label: "Rental Active" },
];

type RentalStageStatus = "completed" | "active" | "pending";

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

export interface RentalRoadmapProps {
  currentStage: RentalStage;
}

export function RentalRoadmap({ currentStage }: RentalRoadmapProps) {
  const currentIndex = RENTAL_STAGES.findIndex((entry) => entry.stage === currentStage);

  return (
    <ol className="flex flex-col">
      {RENTAL_STAGES.map(({ stage, label }, index) => {
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
              <div className="font-medium text-stone-900">{label}</div>
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
