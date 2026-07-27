// Client/test-safe: the canonical rental workflow definition, as plain data
// and types only. No database access happens here, so this stays importable
// from Client Components — the Prisma-backed read/write layer lives in
// src/lib/data/rentalStages.ts, which is `server-only`.
//
// This replaces the former RENTAL_STAGES export in
// src/components/ui/RentalRoadmap.tsx, which described a PURCHASE workflow
// (Reservation → SPA Signed → … → Rental Active) and modelled progress as a
// single "current stage" index where everything earlier was implicitly done.
// The real process is a LETTING workflow where stages complete independently,
// several carry a document, and one carries structured offer terms.

/** Which kind of file, if any, a stage accepts. */
export type RentalStageSlot = "none" | "pdf" | "photo";

export type RentalStageStatus = "PENDING" | "DONE";

export interface RentalStageDefinition {
  key: string;
  label: string;
  order: number;
  slot: RentalStageSlot;
  /** True only for OFFER, which carries price/duration/comments. */
  hasOfferFields?: boolean;
}

/**
 * The ten stages, in order. This array is the source of truth — the database
 * stores a row only for stages that have actually been touched, so adding,
 * renaming or reordering a stage here needs no migration and cannot strand
 * rows (an unknown stageKey read back from the database is simply ignored).
 *
 * Slots are assigned exactly as specified. PROFESSIONAL_PHOTO_VIDEO has no
 * slot because none was requested for it; the slot mechanism is generic, so
 * giving it one later is a one-word change on this line and nothing else.
 */
export const RENTAL_STAGES: ReadonlyArray<RentalStageDefinition> = [
  { key: "REPRESENTATION_MANDATE_SIGNED", label: "Representation Mandate Signed", order: 1, slot: "pdf" },
  { key: "PROPERTY_INSPECTION", label: "Property Inspection", order: 2, slot: "photo" },
  { key: "KEYS_DELIVERED", label: "Keys Delivered", order: 3, slot: "none" },
  { key: "ENERGY_CERTIFICATE", label: "Energy Certificate", order: 4, slot: "pdf" },
  { key: "ELECTRICITY_CONNECTION", label: "Electricity Connection", order: 5, slot: "none" },
  { key: "PROFESSIONAL_PHOTO_VIDEO", label: "Professional Photo/Video", order: 6, slot: "none" },
  { key: "VIEWINGS", label: "Viewings", order: 7, slot: "none" },
  { key: "OFFER", label: "Offer", order: 8, slot: "none", hasOfferFields: true },
  { key: "CONTRACT_SIGNED", label: "Contract Signed", order: 9, slot: "pdf" },
  { key: "BROKERS_FEE_PAID", label: "Broker's Fee Paid", order: 10, slot: "pdf" },
];

export const RENTAL_STAGE_BY_KEY: ReadonlyMap<string, RentalStageDefinition> = new Map(
  RENTAL_STAGES.map((stage) => [stage.key, stage]),
);

export function isKnownRentalStage(key: string): boolean {
  return RENTAL_STAGE_BY_KEY.has(key);
}

/** Accepted upload types per slot, enforced server-side on upload. */
export const SLOT_CONTENT_TYPES: Record<Exclude<RentalStageSlot, "none">, readonly string[]> = {
  pdf: ["application/pdf"],
  photo: ["image/jpeg", "image/png", "image/webp"],
};

/**
 * One stage as the UI consumes it: the definition merged with whatever has
 * actually been recorded. A stage with no database row is PENDING with no
 * attachment — see the RentalStageRecord doc comment in prisma/schema.prisma
 * for why absence, rather than a seeded row, means pending.
 */
export interface RentalStageView {
  key: string;
  label: string;
  order: number;
  slot: RentalStageSlot;
  hasOfferFields: boolean;
  status: RentalStageStatus;
  completedAt: string | null;
  attachmentFilename: string | null;
  hasAttachment: boolean;
  offerPrice: number | null;
  offerDurationMonths: number | null;
  offerComments: string | null;
}
