import "server-only";
import { prisma } from "@/lib/prisma";
import type { VisaStep } from "@/generated/prisma/client";

export interface VisaStepEntry {
  id: string;
  stepOrder: number;
  title: string;
  description: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  completedAt: string | null;
}

function toVisaStepEntry(row: VisaStep): VisaStepEntry {
  return {
    id: row.id,
    stepOrder: row.stepOrder,
    title: row.title,
    description: row.description,
    status: row.status,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

/**
 * Fetches a single user's Golden Visa application steps, step-order
 * ascending — the data behind the "Golden Visa" 5-step timeline screen
 * (FRONTEND_SPEC.md).
 *
 * Filters strictly by BOTH tenantId AND userId, the same reasoning as
 * getUserLedger() in ./ledgers.ts: VisaStep.userId is a real, required
 * column (unlike EncryptedApiKey's deliberately tenant-shared design), so
 * there is no reason to accept a userId parameter without actually
 * filtering on it. Prisma bypasses RLS entirely (see ARCHITECTURE.md's
 * "Clerk ↔ Supabase Third-Party Auth" section), so this application-level
 * filter is the real enforcement boundary for this path — the
 * visa_steps_select RLS policy in
 * supabase/migrations/0005_construction_and_visa.sql only ever applies to
 * requests made through PostgREST, which this function never uses.
 */
export async function getUserVisaSteps(tenantId: string, userId: string): Promise<VisaStepEntry[]> {
  const rows = await prisma.visaStep.findMany({
    where: { tenantId, userId },
    orderBy: { stepOrder: "asc" },
  });

  return rows.map(toVisaStepEntry);
}
