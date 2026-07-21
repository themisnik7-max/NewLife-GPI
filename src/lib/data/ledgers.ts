import "server-only";
import { prisma } from "@/lib/prisma";
import { PaymentStatus } from "@/generated/prisma/client";
import type { PaymentLedger } from "@/generated/prisma/client";

export interface LedgerEntry {
  id: string;
  propertyId: string;
  userId: string;
  amount: number;
  amountPaid: number;
  dueDate: string;
  status: "PENDING" | "PAID" | "OVERDUE";
  isDelayed: boolean;
  penaltyAmount: number;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `isDelayed` is always computed here from the current clock, never
 * trusted from the row's own stored is_delayed column: a PENDING
 * installment becomes delayed the instant its due date passes, with no
 * batch job needed to flip a persisted flag first. The stored column still
 * exists in the schema (a future penalty-assessment job may still want the
 * persisted history), but this mapper's output always overrides it with a
 * fresh calculation.
 */
function toLedgerEntry(row: PaymentLedger, now: Date): LedgerEntry {
  return {
    id: row.id,
    propertyId: row.propertyId,
    userId: row.userId,
    amount: row.amount,
    amountPaid: row.amountPaid,
    dueDate: toIsoDate(row.dueDate),
    status: row.status,
    isDelayed: row.status !== PaymentStatus.PAID && row.dueDate < now,
    penaltyAmount: row.penaltyAmount,
  };
}

/**
 * Fetches every payment installment for a tenant, earliest due date first.
 *
 * No `userId` parameter, matching the request exactly: this is the
 * tenant-wide view (e.g. an admin reviewing every installment across the
 * tenant), not a single user's own payments. RLS's payment_ledger_select
 * policy already distinguishes "own rows only" from "admin sees all" for
 * the PostgREST path; this Prisma path bypasses RLS entirely, so it must
 * not be handed a client-supplied userId to silently narrow by — that
 * would just be a second, easily-forgotten place the same access-control
 * decision has to be reimplemented and kept in sync.
 */
export async function getTenantLedger(tenantId: string): Promise<LedgerEntry[]> {
  const now = new Date();
  const rows = await prisma.paymentLedger.findMany({
    where: { tenantId },
    orderBy: { dueDate: "asc" },
  });

  return rows.map((row) => toLedgerEntry(row, now));
}

/**
 * Fetches a single user's own payment installments within a tenant,
 * earliest due date first — the counterpart to getTenantLedger() above.
 *
 * That function is deliberately tenant-wide with no userId (an admin-style
 * "every installment in the tenant" view). This is the function a personal
 * "my payments" page must use instead: PaymentLedger.userId is a real,
 * required column, so — unlike EncryptedApiKey — there is no reason to
 * accept a userId parameter without actually filtering on it here. Using
 * getTenantLedger() for a single client's own payments page would leak
 * every other tenant member's payment history onto their page.
 */
export async function getUserLedger(tenantId: string, userId: string): Promise<LedgerEntry[]> {
  const now = new Date();
  const rows = await prisma.paymentLedger.findMany({
    where: { tenantId, userId },
    orderBy: { dueDate: "asc" },
  });

  return rows.map((row) => toLedgerEntry(row, now));
}

/**
 * Records a payment against a specific installment.
 *
 * Runs inside a single interactive transaction so the "does this ledger
 * row actually belong to this tenant" check and the write happen against a
 * consistent view of the same row — `findFirst({ where: { id, tenantId } })`
 * is the one authoritative ownership check (mirroring getProjectById's
 * `where: { id, tenantId }` pattern in ./projects.ts); nothing else can
 * change this row's tenantId between that check and the update within the
 * same transaction, so the subsequent `update` doesn't need to repeat the
 * tenantId filter itself.
 *
 * `amountPaid` on PaymentLedger tracks cumulative progress, since
 * PENDING/PAID/OVERDUE alone can't represent "partially paid." A payment
 * that would push the cumulative total past the installment's full
 * `amount` is rejected outright rather than silently accepted as an
 * overpayment credit — this schema has no refund/credit mechanism to apply
 * the excess to, so accepting it would just create an inconsistent,
 * unexplained balance.
 */
export async function recordTenantPayment(
  tenantId: string,
  ledgerId: string,
  amountPaid: number,
): Promise<LedgerEntry> {
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    throw new Error("amountPaid must be a positive, finite number.");
  }

  return prisma.$transaction(async (tx) => {
    const ledger = await tx.paymentLedger.findFirst({ where: { id: ledgerId, tenantId } });

    if (!ledger) {
      throw new Error(`Ledger entry ${ledgerId} was not found for tenant ${tenantId}.`);
    }

    if (ledger.status === PaymentStatus.PAID) {
      throw new Error(`Ledger entry ${ledgerId} is already fully paid.`);
    }

    const remainingBalance = ledger.amount - ledger.amountPaid;
    if (amountPaid > remainingBalance) {
      throw new Error(
        `Payment of ${amountPaid} exceeds the outstanding balance of ${remainingBalance} for ledger entry ${ledgerId}.`,
      );
    }

    const newAmountPaid = ledger.amountPaid + amountPaid;
    const isFullySettled = newAmountPaid >= ledger.amount;

    const updated = await tx.paymentLedger.update({
      where: { id: ledgerId },
      data: {
        amountPaid: newAmountPaid,
        status: isFullySettled ? PaymentStatus.PAID : ledger.status,
      },
    });

    return toLedgerEntry(updated, new Date());
  });
}
