import "server-only";
import { prisma } from "@/lib/prisma";
import { recordSale } from "@/lib/data/propertyOwnership";
import type { ActorContext } from "@/lib/data/audit";
import type { PlannedRow } from "@/lib/csv";
import { Role } from "@/lib/auth/role";

/**
 * Applies a sold-property import plan.
 *
 * ⚠️ ADMIN-ONLY. The caller performs the role check, as with every other
 * admin-only writer here.
 *
 * ⚠️ ROW-BY-ROW, NOT ONE BIG TRANSACTION, and that is deliberate. Wrapping a
 * 200-row import in a single transaction means one bad row on line 187 rolls
 * back the 186 good ones, and the user gets nothing for a mistake they can
 * see and fix in isolation. Each row is its own unit: it either lands or is
 * reported, and the result names every outcome. `recordSale` audits each one
 * individually, so the trail reads the same as if they had been typed in.
 *
 * The tradeoff, stated plainly: a partially-applied import is possible. That
 * is the right failure for a spreadsheet paste — re-running it is safe,
 * because a row whose ownership already exists updates the sale details
 * rather than duplicating (see recordSale).
 */

export type ImportRowOutcome = "created" | "updated" | "skipped" | "failed";

export interface ImportRowResult {
  lineNumber: number;
  outcome: ImportRowOutcome;
  /** What was matched or what went wrong — always populated. */
  detail: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  rows: ImportRowResult[];
}

/**
 * Resolves the properties and clients a plan refers to, in two queries.
 *
 * Names and emails are matched case-insensitively: a spreadsheet says
 * "aegean court" where the database says "Aegean Court", and rejecting that
 * would make the importer useless for the exact data it exists to ingest.
 *
 * Ambiguity is NOT resolved by picking one. Two properties with the same name
 * means the row cannot be placed without guessing, and a wrong guess files a
 * quarter-million-euro sale against the wrong unit — so the row is failed and
 * says why.
 */
async function resolveLookups(
  tenantId: string,
  plan: readonly PlannedRow[],
): Promise<{
  propertiesByName: Map<string, string[]>;
  usersByEmail: Map<string, string>;
}> {
  const [properties, users] = await Promise.all([
    prisma.property.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { tenantId, role: Role.TENANT },
      select: { id: true, email: true },
    }),
  ]);

  const propertiesByName = new Map<string, string[]>();
  for (const property of properties) {
    const key = property.name.trim().toLowerCase();
    const existing = propertiesByName.get(key);
    if (existing) existing.push(property.id);
    else propertiesByName.set(key, [property.id]);
  }

  const usersByEmail = new Map(
    users.map((user) => [user.email.trim().toLowerCase(), user.id]),
  );

  return { propertiesByName, usersByEmail };
}

export async function applySoldPropertyImport(
  actor: ActorContext,
  plan: readonly PlannedRow[],
): Promise<ImportResult> {
  const { propertiesByName, usersByEmail } = await resolveLookups(actor.tenantId, plan);
  const rows: ImportRowResult[] = [];

  for (const planned of plan) {
    // Rows the preview already rejected are carried through as skipped
    // rather than dropped, so the result accounts for every line in the file.
    if (planned.problems.length > 0) {
      rows.push({
        lineNumber: planned.lineNumber,
        outcome: "skipped",
        detail: planned.problems.join(" "),
      });
      continue;
    }

    const propertyIds = propertiesByName.get(planned.propertyName.trim().toLowerCase());
    if (!propertyIds) {
      rows.push({
        lineNumber: planned.lineNumber,
        outcome: "failed",
        detail: `No property named "${planned.propertyName}".`,
      });
      continue;
    }
    if (propertyIds.length > 1) {
      rows.push({
        lineNumber: planned.lineNumber,
        outcome: "failed",
        detail: `"${planned.propertyName}" matches ${propertyIds.length} properties — rename them or import this row by hand.`,
      });
      continue;
    }

    const userId = usersByEmail.get(planned.buyerEmail);
    if (!userId) {
      rows.push({
        lineNumber: planned.lineNumber,
        outcome: "failed",
        // Says what to do about it: a buyer must exist as an account first,
        // and only the Clerk webhook can create one.
        detail: `No client account with email ${planned.buyerEmail}. Invite them first.`,
      });
      continue;
    }

    const alreadyOwned = await prisma.propertyOwnership.findFirst({
      where: { tenantId: actor.tenantId, userId, propertyId: propertyIds[0] },
      select: { id: true },
    });

    try {
      await recordSale(actor, userId, propertyIds[0], {
        saleDate: planned.saleDate,
        salePrice: planned.salePrice,
      });
      rows.push({
        lineNumber: planned.lineNumber,
        // Distinguished so re-running a file reads as "updated 40" rather
        // than "created 40", which would look like duplication.
        outcome: alreadyOwned ? "updated" : "created",
        detail: `${planned.propertyName} → ${planned.buyerEmail}`,
      });
    } catch (err) {
      rows.push({
        lineNumber: planned.lineNumber,
        outcome: "failed",
        detail: err instanceof Error ? err.message : "Unknown error.",
      });
    }
  }

  return {
    created: rows.filter((row) => row.outcome === "created").length,
    updated: rows.filter((row) => row.outcome === "updated").length,
    skipped: rows.filter((row) => row.outcome === "skipped").length,
    failed: rows.filter((row) => row.outcome === "failed").length,
    rows,
  };
}
