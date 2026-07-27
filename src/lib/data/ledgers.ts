import "server-only";
import { prisma } from "@/lib/prisma";
import { AuditAction, recordAuditEvent, recordFieldChanges, type ActorContext } from "@/lib/data/audit";
import { toDisplayName } from "@/lib/clientName";
import type { PaymentLedger } from "@/generated/prisma/client";

/**
 * Plain const, not a Prisma-generated enum — PaymentLedger.status is a
 * Prisma `String` column (see the note on User.role in prisma/schema.prisma
 * for the full reason: Prisma 7's "prisma-client" generator requires a real
 * native Postgres enum type for any Prisma `enum` field, which this
 * project's `text + check` migrations never created).
 */
const PaymentStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
} as const;

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

// Prisma now returns a raw `string` for this column (see the PaymentStatus
// comment above) rather than a narrowed enum type, so an unrecognized value
// throws here explicitly instead of being a compile-time impossibility the
// type system no longer actually guarantees.
function toLedgerStatus(status: string): LedgerEntry["status"] {
  if (status !== "PENDING" && status !== "PAID" && status !== "OVERDUE") {
    throw new Error(`Unrecognized payment ledger status from database: ${status}`);
  }
  return status;
}

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" });

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
    status: toLedgerStatus(row.status),
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
 * A tenant-wide installment with enough context to be read on its own.
 *
 * `getTenantLedger()` above returns bare ledger rows, which are fine for a
 * client's own page (where every row belongs to the person reading it) and
 * unreadable on an admin page: a list of amounts and dates with no indication
 * of who owes what. Extends rather than replaces it so the existing callers
 * and their tests are untouched.
 */
export interface TenantLedgerEntry extends LedgerEntry {
  clientName: string;
  clientEmail: string;
  propertyName: string;
  /** amount − amountPaid, never negative. */
  outstanding: number;
}

export interface TenantPaymentsOverview {
  entries: TenantLedgerEntry[];
  totals: {
    billed: number;
    collected: number;
    outstanding: number;
    overdueCount: number;
  };
}

/**
 * Every installment in the tenant, with its client and property, plus totals.
 *
 * Ordered overdue first, then by due date. Sorting purely by due date would
 * bury a two-month-late installment beneath rows that are merely upcoming,
 * which inverts what this page exists to surface.
 *
 * Totals are computed from the same rows that are returned, not by a
 * separate aggregate query: two queries could disagree if a payment lands
 * between them, and a page whose column of numbers does not add up to its
 * own footer is worse than a slightly stale one. (getTenantMetrics() in
 * ./metrics.ts does use aggregates — it returns no rows to disagree with.)
 */
export async function getTenantPaymentsOverview(tenantId: string): Promise<TenantPaymentsOverview> {
  const now = new Date();
  const rows = await prisma.paymentLedger.findMany({
    where: { tenantId },
    orderBy: { dueDate: "asc" },
    include: {
      user: { select: { email: true, firstName: true, lastName: true } },
      property: { select: { name: true } },
    },
  });

  const entries = rows
    .map((row) => {
      const base = toLedgerEntry(row, now);
      return {
        ...base,
        clientName: toDisplayName(row.user.firstName, row.user.lastName, row.user.email),
        clientEmail: row.user.email,
        propertyName: row.property.name,
        outstanding: Math.max(row.amount - row.amountPaid, 0),
      };
    })
    .sort((a, b) => {
      if (a.isDelayed !== b.isDelayed) return a.isDelayed ? -1 : 1;
      return a.dueDate.localeCompare(b.dueDate);
    });

  return {
    entries,
    totals: {
      billed: entries.reduce((sum, entry) => sum + entry.amount, 0),
      collected: entries.reduce((sum, entry) => sum + entry.amountPaid, 0),
      outstanding: entries.reduce((sum, entry) => sum + entry.outstanding, 0),
      overdueCount: entries.filter((entry) => entry.isDelayed).length,
    },
  };
}

/**
 * Creates a new payment installment for a client against a property — the
 * missing counterpart to recordTenantPayment() below, which can only pay
 * against a row that already exists. Before this, nothing in the app could
 * create a ledger row at all; every installment came from manual seeding.
 *
 * Verifies both the property and the user belong to `tenantId` before
 * writing, the same reasoning as assignPropertyToClient() in
 * ./propertyOwnership.ts: this is a Prisma-path write, so RLS provides no
 * protection and a client-supplied id could otherwise reference a real row
 * in another tenant.
 */
export async function createLedgerEntry(
  actor: ActorContext,
  propertyId: string,
  userId: string,
  amount: number,
  dueDate: string,
): Promise<LedgerEntry> {
  const tenantId = actor.tenantId;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive, finite number.");
  }
  if (Number.isNaN(Date.parse(dueDate))) {
    throw new Error(`dueDate is not a valid date: ${dueDate}`);
  }

  const [property, user] = await Promise.all([
    prisma.property.findFirst({ where: { id: propertyId, tenantId }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } }),
  ]);

  if (!property) {
    throw new Error(`Property ${propertyId} was not found for tenant ${tenantId}.`);
  }
  if (!user) {
    throw new Error(`User ${userId} was not found for tenant ${tenantId}.`);
  }

  const created = await prisma.$transaction(async (tx) => {
    const ledger = await tx.paymentLedger.create({
      data: {
        tenantId,
        propertyId,
        userId,
        amount,
        dueDate: new Date(dueDate),
        status: PaymentStatus.PENDING,
      },
    });

    await recordAuditEvent(tx, {
      tenantId,
      actorUserId: actor.actorUserId,
      entityType: "PaymentLedger",
      entityId: ledger.id,
      action: AuditAction.CREATE,
      metadata: { subjectUserId: userId, propertyId, amount, dueDate },
    });

    return ledger;
  });

  return toLedgerEntry(created, new Date());
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
 *
 * Also creates a Notification for the ledger's own user, in the same
 * transaction as the payment write (via `tx`, not the standalone
 * createNotification() helper in ./notifications.ts, which uses the
 * top-level client — using `tx` here is what makes the notification and the
 * payment update atomic: either both commit or neither does). This is
 * deliberately the only place in the app that generates a notification
 * automatically today; no other mutation exists yet (construction
 * milestones/visa steps have no write path at all) to hook a second one
 * into without inventing an event nothing else asked for.
 */
export async function recordTenantPayment(
  actor: ActorContext,
  ledgerId: string,
  amountPaid: number,
): Promise<LedgerEntry> {
  const tenantId = actor.tenantId;
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

    await tx.notification.create({
      data: {
        tenantId,
        userId: ledger.userId,
        message: isFullySettled
          ? `Payment of ${currencyFormatter.format(amountPaid)} recorded — installment fully paid.`
          : `Payment of ${currencyFormatter.format(amountPaid)} recorded.`,
      },
    });

    // Joins the existing transaction rather than opening a second one, so
    // payment + notification + audit remain a single atomic unit.
    await recordFieldChanges(
      tx,
      {
        tenantId,
        actorUserId: actor.actorUserId,
        entityType: "PaymentLedger",
        entityId: ledgerId,
      },
      { amountPaid: ledger.amountPaid, status: ledger.status },
      { amountPaid: newAmountPaid, status: updated.status },
    );

    return toLedgerEntry(updated, new Date());
  });
}
