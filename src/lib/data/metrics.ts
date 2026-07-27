import "server-only";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/auth/role";
import { RENTAL_STAGES } from "@/lib/rentalStages";

/**
 * Tenant-wide roll-ups behind the admin Overview.
 *
 * Every figure here is computed from rows that already exist — nothing is
 * estimated, projected, or carried over from the mock data this dashboard
 * replaced. Where a figure would be misleading on its own, the shape
 * deliberately carries the caveat alongside it (see `salesValueRecorded` /
 * `salesMissingPrice`) so the page can show the gap rather than presenting a
 * partial total as a complete one.
 *
 * Counts are done with `count`/`aggregate` rather than by fetching rows and
 * measuring the array: these are unbounded sets, and pulling every payment
 * row into the Node process to add up two columns is the kind of thing that
 * works fine on demo data and falls over on real data.
 */

export interface TenantMetrics {
  clients: {
    total: number;
    /** Clients with at least one property assigned. */
    withProperty: number;
  };
  properties: {
    total: number;
    /** Properties with at least one owner — see getSoldProperties() on why. */
    sold: number;
    /** Units still available across the whole catalog. */
    availableUnits: number;
    listedForRental: number;
  };
  sales: {
    /** Sum of recorded sale prices across every ownership row. */
    valueRecorded: number;
    /** Ownerships with no sale price on file — the gap in the figure above. */
    missingPrice: number;
  };
  payments: {
    /** Sum of every installment's face value. */
    billed: number;
    /** Sum of amounts actually received, including partial payments. */
    collected: number;
    /** billed − collected. Never negative: overpayment is rejected on write. */
    outstanding: number;
    /** Unpaid installments whose due date has passed, as of now. */
    overdueCount: number;
  };
  visa: {
    /** Clients with at least one visa step on record. */
    clientsInProgress: number;
    stepsCompleted: number;
    stepsTotal: number;
  };
  rentals: {
    /** Properties flagged as lettings inventory. */
    unitsListed: number;
    /** Clients with at least one completed letting stage. */
    clientsInProgress: number;
    stagesCompleted: number;
    /** unitsListed × the canonical stage count, for a progress denominator. */
    stagesTotal: number;
  };
}

export async function getTenantMetrics(tenantId: string): Promise<TenantMetrics> {
  const now = new Date();

  const [
    clientTotal,
    clientsWithProperty,
    propertyTotal,
    propertiesSold,
    unitAggregate,
    listedForRental,
    saleAggregate,
    salesMissingPrice,
    paymentAggregate,
    overdueCount,
    visaClients,
    visaStepsCompleted,
    visaStepsTotal,
    rentalClients,
    rentalStagesCompleted,
  ] = await Promise.all([
    prisma.user.count({ where: { tenantId, role: Role.TENANT } }),
    prisma.user.count({ where: { tenantId, role: Role.TENANT, propertyOwnerships: { some: {} } } }),
    prisma.property.count({ where: { tenantId } }),
    prisma.property.count({ where: { tenantId, propertyOwnerships: { some: {} } } }),
    prisma.property.aggregate({ where: { tenantId }, _sum: { availableUnits: true } }),
    prisma.property.count({ where: { tenantId, listedForRental: true } }),
    prisma.propertyOwnership.aggregate({ where: { tenantId }, _sum: { salePrice: true } }),
    prisma.propertyOwnership.count({ where: { tenantId, salePrice: null } }),
    prisma.paymentLedger.aggregate({ where: { tenantId }, _sum: { amount: true, amountPaid: true } }),
    // Computed against the clock, not the stored is_delayed flag, for the
    // same reason toLedgerEntry() recomputes it in ./ledgers.ts: an
    // installment becomes overdue the moment its due date passes, with no
    // batch job needed to flip a column first.
    prisma.paymentLedger.count({ where: { tenantId, status: { not: "PAID" }, dueDate: { lt: now } } }),
    prisma.user.count({ where: { tenantId, role: Role.TENANT, visaSteps: { some: {} } } }),
    prisma.visaStep.count({ where: { tenantId, status: "COMPLETED" } }),
    prisma.visaStep.count({ where: { tenantId } }),
    prisma.rentalStageRecord
      .findMany({ where: { tenantId, status: "DONE" }, select: { userId: true }, distinct: ["userId"] })
      .then((rows) => rows.length),
    prisma.rentalStageRecord.count({ where: { tenantId, status: "DONE" } }),
  ]);

  const billed = paymentAggregate._sum.amount ?? 0;
  const collected = paymentAggregate._sum.amountPaid ?? 0;

  return {
    clients: { total: clientTotal, withProperty: clientsWithProperty },
    properties: {
      total: propertyTotal,
      sold: propertiesSold,
      availableUnits: unitAggregate._sum.availableUnits ?? 0,
      listedForRental,
    },
    sales: {
      // Prisma returns Decimal for a numeric column; converted at this
      // boundary so nothing downstream deals with Decimal.
      valueRecorded: saleAggregate._sum.salePrice === null ? 0 : Number(saleAggregate._sum.salePrice),
      missingPrice: salesMissingPrice,
    },
    payments: {
      billed,
      collected,
      // Clamped at zero defensively. Overpayment is already rejected by
      // recordTenantPayment(), so a negative here would mean data written
      // outside the application — in which case showing "−€400 outstanding"
      // helps nobody.
      outstanding: Math.max(billed - collected, 0),
      overdueCount,
    },
    visa: {
      clientsInProgress: visaClients,
      stepsCompleted: visaStepsCompleted,
      stepsTotal: visaStepsTotal,
    },
    rentals: {
      unitsListed: listedForRental,
      clientsInProgress: rentalClients,
      stagesCompleted: rentalStagesCompleted,
      stagesTotal: listedForRental * RENTAL_STAGES.length,
    },
  };
}
