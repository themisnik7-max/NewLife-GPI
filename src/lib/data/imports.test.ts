import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    propertyOwnership: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/data/propertyOwnership", () => ({ recordSale: vi.fn() }));

import { applySoldPropertyImport } from "@/lib/data/imports";
import { recordSale } from "@/lib/data/propertyOwnership";
import { prisma } from "@/lib/prisma";
import type { PlannedRow } from "@/lib/csv";

const mockedPropertyFindMany = vi.mocked(prisma.property.findMany);
const mockedUserFindMany = vi.mocked(prisma.user.findMany);
const mockedOwnershipFindFirst = vi.mocked(prisma.propertyOwnership.findFirst);
const mockedRecordSale = vi.mocked(recordSale);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ACTOR = { tenantId: TENANT_A, actorUserId: "user_admin" };

function row(overrides: Partial<PlannedRow> = {}): PlannedRow {
  return {
    lineNumber: 1,
    propertyName: "Aegean Court",
    buyerEmail: "maria@example.com",
    salePrice: 250000,
    saleDate: "2026-06-01",
    problems: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockedPropertyFindMany.mockReset().mockResolvedValue([
    { id: "prop-1", name: "Aegean Court" },
  ] as never);
  mockedUserFindMany.mockReset().mockResolvedValue([
    { id: "user_maria", email: "maria@example.com" },
  ] as never);
  mockedOwnershipFindFirst.mockReset().mockResolvedValue(null as never);
  mockedRecordSale.mockReset().mockResolvedValue(undefined);
});

describe("applying an import", () => {
  it("records a matched row as created", async () => {
    const result = await applySoldPropertyImport(ACTOR, [row()]);

    expect(mockedRecordSale).toHaveBeenCalledWith(ACTOR, "user_maria", "prop-1", {
      saleDate: "2026-06-01",
      salePrice: 250000,
    });
    expect(result.created).toBe(1);
    expect(result.rows[0].outcome).toBe("created");
  });

  it("matches property and email case-insensitively", async () => {
    // A spreadsheet says "aegean court" where the database says "Aegean
    // Court"; rejecting that makes the importer useless for its own purpose.
    const result = await applySoldPropertyImport(ACTOR, [
      row({ propertyName: "  aegean COURT  " }),
    ]);

    expect(result.created).toBe(1);
  });

  it("reports an existing ownership as updated, not created", async () => {
    // Re-running a file should read as "updated 40", not "created 40" — the
    // latter looks like duplication.
    mockedOwnershipFindFirst.mockResolvedValueOnce({ id: "own-1" } as never);

    const result = await applySoldPropertyImport(ACTOR, [row()]);

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
  });

  it("carries a preview-rejected row through as skipped rather than dropping it", async () => {
    // The result must account for every line in the file.
    const result = await applySoldPropertyImport(ACTOR, [
      row({ lineNumber: 3, problems: ["Property is blank."] }),
    ]);

    expect(result.skipped).toBe(1);
    expect(result.rows[0]).toMatchObject({ lineNumber: 3, outcome: "skipped" });
    expect(mockedRecordSale).not.toHaveBeenCalled();
  });

  it("fails a row whose property does not exist, naming it", async () => {
    const result = await applySoldPropertyImport(ACTOR, [row({ propertyName: "Nowhere House" })]);

    expect(result.failed).toBe(1);
    expect(result.rows[0].detail).toContain("Nowhere House");
  });

  it("refuses to guess when a property name is ambiguous", async () => {
    // A wrong guess files a quarter-million-euro sale against the wrong unit.
    mockedPropertyFindMany.mockResolvedValueOnce([
      { id: "prop-1", name: "Aegean Court" },
      { id: "prop-2", name: "Aegean Court" },
    ] as never);

    const result = await applySoldPropertyImport(ACTOR, [row()]);

    expect(result.failed).toBe(1);
    expect(result.rows[0].detail).toMatch(/matches 2 properties/);
    expect(mockedRecordSale).not.toHaveBeenCalled();
  });

  it("fails an unknown buyer with the action that fixes it", async () => {
    const result = await applySoldPropertyImport(ACTOR, [row({ buyerEmail: "ghost@example.com" })]);

    expect(result.failed).toBe(1);
    // Only the Clerk webhook can create a User, so "invite them" is the
    // actual remedy.
    expect(result.rows[0].detail).toMatch(/Invite them first/);
  });

  it("only ever matches buyers, never admins", async () => {
    await applySoldPropertyImport(ACTOR, [row()]);

    const { where } = mockedUserFindMany.mock.calls[0][0] as { where: { role: string } };
    expect(where.role).toBe("TENANT");
  });

  it("scopes both lookups to the tenant", async () => {
    await applySoldPropertyImport(ACTOR, [row()]);

    for (const mocked of [mockedPropertyFindMany, mockedUserFindMany]) {
      const { where } = mocked.mock.calls[0][0] as { where: { tenantId: string } };
      expect(where.tenantId).toBe(TENANT_A);
    }
  });

  it("resolves lookups in two queries regardless of row count", async () => {
    await applySoldPropertyImport(ACTOR, [row({ lineNumber: 1 }), row({ lineNumber: 2 }), row({ lineNumber: 3 })]);

    expect(mockedPropertyFindMany).toHaveBeenCalledTimes(1);
    expect(mockedUserFindMany).toHaveBeenCalledTimes(1);
  });
});

describe("partial failure", () => {
  it("keeps going after a bad row instead of rolling the good ones back", async () => {
    // One bad row on line 187 must not discard 186 good ones — the user can
    // see and fix that row in isolation.
    mockedRecordSale
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("salePrice must be a positive, finite number."))
      .mockResolvedValueOnce(undefined);

    const result = await applySoldPropertyImport(ACTOR, [
      row({ lineNumber: 1 }),
      row({ lineNumber: 2 }),
      row({ lineNumber: 3 }),
    ]);

    expect(result.created).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.rows[1]).toMatchObject({ lineNumber: 2, outcome: "failed" });
  });

  it("surfaces the write layer's own message rather than a generic one", async () => {
    mockedRecordSale.mockRejectedValueOnce(new Error("saleDate cannot be in the future."));

    const result = await applySoldPropertyImport(ACTOR, [row()]);

    expect(result.rows[0].detail).toBe("saleDate cannot be in the future.");
  });

  it("accounts for every line in the totals", async () => {
    mockedRecordSale.mockRejectedValueOnce(new Error("boom"));

    const result = await applySoldPropertyImport(ACTOR, [
      row({ lineNumber: 1 }),
      row({ lineNumber: 2, problems: ["Buyer email is blank."] }),
      row({ lineNumber: 3, propertyName: "Nowhere" }),
    ]);

    expect(result.created + result.updated + result.skipped + result.failed).toBe(3);
    expect(result.rows).toHaveLength(3);
  });
});
