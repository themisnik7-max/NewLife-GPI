// Client/test-safe: the canonical document vocabulary, as plain data, types
// and pure functions only. No database or storage access happens here, so
// this stays importable from Client Components — the Prisma-backed layer
// lives in src/lib/data/documents.ts, which is `server-only`, and the object
// store lives in src/lib/storage.ts.
//
// Same split as src/lib/rentalStages.ts ↔ src/lib/data/rentalStages.ts, for
// the same reason: the upload form needs the accepted MIME types and the size
// limit to validate before sending, and it cannot import a `server-only`
// module to get them.

/** Which records a file can be filed against. */
export type DocumentEntityType =
  | "Property"
  | "User"
  | "PaymentLedger"
  | "ConstructionMilestone"
  | "Deal";

export interface DocumentCategoryDefinition {
  key: string;
  label: string;
  /** Shown under the category in the upload picker. */
  hint: string;
  /** Which entity types this category is offered for. */
  entityTypes: readonly DocumentEntityType[];
}

/**
 * The canonical categories. This array is the source of truth — the database
 * column has no check constraint (see 0010_documents.sql), so adding,
 * renaming or reordering a category needs no migration and cannot strand
 * rows: an unknown category read back is rendered under its raw key rather
 * than throwing, the same tolerance getClientRentalStages() applies to an
 * unknown stageKey.
 */
export const DOCUMENT_CATEGORIES: ReadonlyArray<DocumentCategoryDefinition> = [
  {
    key: "LEASE_AGREEMENT",
    label: "Lease agreement",
    hint: "Signed tenancy contracts and addenda",
    entityTypes: ["Property", "User"],
  },
  {
    key: "SALE_CONTRACT",
    label: "Sale contract",
    hint: "SPA, reservation forms, notarial deeds",
    entityTypes: ["Property", "User", "Deal"],
  },
  {
    key: "PAYMENT_RECEIPT",
    label: "Payment receipt",
    hint: "Proof of transfer, bank confirmations, invoices",
    entityTypes: ["PaymentLedger", "User", "Property"],
  },
  {
    key: "PROGRESS_PHOTO",
    label: "Progress photo",
    hint: "Site and construction photography",
    entityTypes: ["Property", "ConstructionMilestone"],
  },
  {
    key: "FLOOR_PLAN",
    label: "Floor plan",
    hint: "Architectural drawings and unit layouts",
    entityTypes: ["Property"],
  },
  {
    key: "CERTIFICATE",
    label: "Certificate",
    hint: "Energy certificates, permits, compliance documents",
    entityTypes: ["Property", "ConstructionMilestone"],
  },
  {
    key: "POWER_OF_ATTORNEY",
    label: "Power of attorney",
    hint: "Notarised POA authorising purchase on the buyer's behalf",
    // Filed against the person who granted it, and against the deal it
    // enables. It is the document that gates the POWER_OF_ATTORNEY stage in
    // src/lib/pipeline.ts — the funnel's fourth step is not a status someone
    // ticks, it is a notarised instrument that either exists or does not.
    entityTypes: ["User", "Deal"],
  },
  {
    key: "IDENTITY",
    label: "Identity document",
    hint: "Passport, tax number, proof of address",
    entityTypes: ["User"],
  },
  {
    key: "VISA_DOCUMENT",
    label: "Visa document",
    hint: "Golden Visa application paperwork and decisions",
    entityTypes: ["User"],
  },
  {
    key: "OTHER",
    label: "Other",
    hint: "Anything that does not fit the categories above",
    entityTypes: ["Property", "User", "PaymentLedger", "ConstructionMilestone", "Deal"],
  },
];

export const DOCUMENT_CATEGORY_BY_KEY: ReadonlyMap<string, DocumentCategoryDefinition> = new Map(
  DOCUMENT_CATEGORIES.map((category) => [category.key, category]),
);

export function isKnownDocumentCategory(key: string): boolean {
  return DOCUMENT_CATEGORY_BY_KEY.has(key);
}

/**
 * Categories offered for one entity type, in canonical order.
 *
 * Filtering the picker rather than showing all nine everywhere is what keeps
 * the data analysable: "identity document" filed against a payment row is
 * technically storable and permanently useless.
 */
export function categoriesForEntityType(
  entityType: DocumentEntityType,
): ReadonlyArray<DocumentCategoryDefinition> {
  return DOCUMENT_CATEGORIES.filter((category) => category.entityTypes.includes(entityType));
}

/**
 * Accepted upload types, enforced server-side in src/lib/storage.ts.
 *
 * Deliberately broader than SLOT_CONTENT_TYPES in src/lib/rentalStages.ts
 * (which is per-stage and narrow by design) but still an allowlist, not a
 * blocklist: this bucket is served through signed URLs that a browser will
 * happily render, so accepting arbitrary types would make it an XSS vector.
 * No SVG for exactly that reason — it is an image tag that can carry script.
 */
export const DOCUMENT_CONTENT_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

/** 25 MB — larger than the 10 MB stage-slot limit, because a scanned
 * multi-page contract or a full-resolution site photo legitimately exceeds
 * it, and bounded enough that one mistaken upload cannot exhaust the quota. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export function isAcceptedDocumentType(contentType: string): boolean {
  return DOCUMENT_CONTENT_TYPES.includes(contentType);
}

/** The `accept` attribute for a file input, derived so the picker and the
 * server-side allowlist can never drift apart. */
export const DOCUMENT_ACCEPT_ATTRIBUTE = DOCUMENT_CONTENT_TYPES.join(",");

export function isImageDocument(contentType: string): boolean {
  return contentType.startsWith("image/");
}

/**
 * Human-readable file size. Binary units (1024) because that is what both
 * operating systems' file browsers report, so a number shown here matches
 * what the user saw before they uploaded.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  // One decimal below 10 (so "1.4 MB" is not rounded to "1 MB"), none above,
  // where the extra digit is noise.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
}

/** One document as the UI consumes it. The storage path is deliberately
 * absent — see Document.storagePath in prisma/schema.prisma. */
export interface DocumentView {
  id: string;
  entityType: string;
  entityId: string;
  category: string;
  /** The category's display label, or the raw key if it is no longer known. */
  categoryLabel: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  description: string | null;
  visibleToClient: boolean;
  uploadedByUserId: string;
  /** Display name of the uploader, resolved at read time. */
  uploadedByName: string;
  createdAt: string;
  isImage: boolean;
}

export function categoryLabelFor(key: string): string {
  return DOCUMENT_CATEGORY_BY_KEY.get(key)?.label ?? key;
}
