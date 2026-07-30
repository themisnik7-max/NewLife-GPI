"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { Role } from "@/lib/auth/role";
import { applySoldPropertyImport, type ImportResult } from "@/lib/data/imports";
import { buildImportPlan, type ParsedCsv } from "@/lib/csv";

/**
 * Applies a sold-property import.
 *
 * The file is parsed and previewed in the browser — the plan the user
 * approved is what arrives here. The plan is nonetheless REBUILT server-side
 * from the raw rows and mapping rather than trusted: a client could otherwise
 * post a plan claiming a future sale date or a negative price and bypass
 * every validation the preview performed. The browser's copy exists to show
 * the user what will happen; this one decides what actually does.
 */

async function requireAdmin() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== Role.ADMIN) {
    throw new Error("Admin access required.");
  }
  return currentUser;
}

export interface ImportSalesActionInput {
  parsed: ParsedCsv;
  mapping: Record<string, number | null>;
}

export async function importSalesAction(input: ImportSalesActionInput): Promise<ImportResult> {
  const currentUser = await requireAdmin();

  if (!input.parsed?.rows?.length) {
    throw new Error("The file has no rows to import.");
  }
  // A bound on what one request can do. Not a business rule — a guard against
  // a paste that would hold a serverless invocation open for minutes.
  if (input.parsed.rows.length > 2000) {
    throw new Error(
      `That file has ${input.parsed.rows.length} rows. Split it into files of 2000 or fewer.`,
    );
  }

  const plan = buildImportPlan(input.parsed, input.mapping);

  const result = await applySoldPropertyImport(
    { tenantId: currentUser.tenantId, actorUserId: currentUser.userId },
    plan.rows,
  );

  revalidatePath("/dashboard/property");
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard");

  return result;
}
