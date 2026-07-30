import { describe, expect, it } from "vitest";

import {
  DOCUMENT_ACCEPT_ATTRIBUTE,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENT_BYTES,
  categoriesForEntityType,
  categoryLabelFor,
  formatFileSize,
  isAcceptedDocumentType,
  isImageDocument,
  isKnownDocumentCategory,
} from "@/lib/documents";

describe("document categories", () => {
  it("recognises every canonical key and rejects unknown ones", () => {
    for (const category of DOCUMENT_CATEGORIES) {
      expect(isKnownDocumentCategory(category.key)).toBe(true);
    }
    expect(isKnownDocumentCategory("NOT_A_CATEGORY")).toBe(false);
  });

  it("has no duplicate keys", () => {
    const keys = DOCUMENT_CATEGORIES.map((category) => category.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("offers only categories that make sense for the entity", () => {
    // Filing an identity document against a payment row is storable and
    // permanently useless — the picker is what prevents it.
    const paymentCategories = categoriesForEntityType("PaymentLedger").map((c) => c.key);
    expect(paymentCategories).toContain("PAYMENT_RECEIPT");
    expect(paymentCategories).not.toContain("IDENTITY");
    expect(paymentCategories).not.toContain("FLOOR_PLAN");
  });

  it("offers progress photos on properties and milestones, which is the construction use case", () => {
    expect(categoriesForEntityType("Property").map((c) => c.key)).toContain("PROGRESS_PHOTO");
    expect(categoriesForEntityType("ConstructionMilestone").map((c) => c.key)).toContain(
      "PROGRESS_PHOTO",
    );
  });

  it("leaves every entity type with at least one category to pick", () => {
    for (const entityType of ["Property", "User", "PaymentLedger", "ConstructionMilestone"] as const) {
      expect(categoriesForEntityType(entityType).length).toBeGreaterThan(0);
    }
  });

  it("falls back to the raw key for a category no longer in the list", () => {
    // A removed category must not break every page that renders a row using
    // it — the same tolerance the rental stage list applies to a stale key.
    expect(categoryLabelFor("LEASE_AGREEMENT")).toBe("Lease agreement");
    expect(categoryLabelFor("RETIRED_CATEGORY")).toBe("RETIRED_CATEGORY");
  });
});

describe("upload type allowlist", () => {
  it("accepts PDFs and the supported image types", () => {
    expect(isAcceptedDocumentType("application/pdf")).toBe(true);
    expect(isAcceptedDocumentType("image/jpeg")).toBe(true);
    expect(isAcceptedDocumentType("image/png")).toBe(true);
  });

  it("rejects SVG, which is an image tag that can carry script", () => {
    // These files are served back through signed URLs a browser will render,
    // so accepting SVG would make the document store an XSS vector.
    expect(isAcceptedDocumentType("image/svg+xml")).toBe(false);
  });

  it("rejects executables, archives, HTML and an absent type", () => {
    expect(isAcceptedDocumentType("text/html")).toBe(false);
    expect(isAcceptedDocumentType("application/zip")).toBe(false);
    expect(isAcceptedDocumentType("application/x-msdownload")).toBe(false);
    expect(isAcceptedDocumentType("")).toBe(false);
  });

  it("derives the input accept attribute from the allowlist so the two cannot drift", () => {
    for (const type of DOCUMENT_CONTENT_TYPES) {
      expect(DOCUMENT_ACCEPT_ATTRIBUTE).toContain(type);
    }
  });

  it("distinguishes images from PDFs, which decides thumbnail vs icon", () => {
    expect(isImageDocument("image/png")).toBe(true);
    expect(isImageDocument("application/pdf")).toBe(false);
  });

  it("caps uploads at 25 MB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe("formatFileSize", () => {
  it("reports bytes below 1 KB", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("uses binary units so the number matches what the OS file browser showed", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
  });

  it("keeps one decimal below 10 and drops it above, where it is noise", () => {
    expect(formatFileSize(Math.round(1.4 * 1024 * 1024))).toBe("1.4 MB");
    expect(formatFileSize(Math.round(12.4 * 1024 * 1024))).toBe("12 MB");
  });

  it("returns a dash rather than NaN for a nonsense size", () => {
    expect(formatFileSize(Number.NaN)).toBe("—");
    expect(formatFileSize(-1)).toBe("—");
  });
});
