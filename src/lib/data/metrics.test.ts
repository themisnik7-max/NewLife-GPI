import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTenantMetrics } from "@/lib/data/metrics";
import { prisma } from "@/lib/prisma";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { count: vi.fn() },
    property: { count: vi.fn(), aggregate: vi.fn() },
    propertyOwnership: { aggregate: vi.fn(), count: vi.fn() },
    paymentLedger: { aggregate: vi.fn(), count: vi.fn() },
    visaStep: { count: vi.fn() },
    rentalStageRecord: { count: vi.fn(), findMany: vi.fn() },
  },
}));

const TENANT = "11111111-1111-1111-1111-111111111111";

/**
 * getTenantMetrics fires fifteen queries in one Promise.all, several of them
 * against the same model with different filters. Mocking by call order would
 * be unreadable and would silently pass if two queries were swapped, so each
 * mock instead inspects its own `where` — which also asserts that the right
 * filter reached the right query.
 */
function setup(overrides: Record<string, number> = {}) {
  const v = {
    clientTotal: 4,
    clientsWithProperty: 3,
    propertyTotal: 6,
    propertiesSold: 2,
    availableUnits: 11,
    listedForRental: 2,
    salesMissingPrice: 1,
    salePriceSum: 850000,
    billed: 100000,
    collected: 40000,
    overdueCount: 2,
    visaClients: 3,
    visaCompleted: 5,
    visaTotal: 12,
    rentalClients: 1,
    rentalDone: 4,
    ...overrides,
  };

  vi.mocked(prisma.user.count).mockImplementation((async (args: { where: Record<string, unknown> }) => {
    if (args.where.propertyOwnerships) return v.clientsWithProperty;
    if (args.where.visaSteps) return v.visaClients;
    return v.clientTotal;
  }) as never);

  vi.mocked(prisma.property.count).mockImplementation((async (args: { where: Record<string, unknown> }) => {
    if (args.where.propertyOwnerships) return v.propertiesSold;
    if (args.where.listedForRental) return v.listedForRental;
    return v.propertyTotal;
  }) as never);

  vi.mocked(prisma.property.aggregate).mockResolvedValue({
    _sum: { availableUnits: v.availableUnits },
  } as never);
  vi.mocked(prisma.propertyOwnership.aggregate).mockResolvedValue({
    // A string stands in for Prisma's Decimal, which is what the module
    // actually calls Number() on.
    _sum: { salePrice: String(v.salePriceSum) },
  } as never);
  vi.mocked(prisma.propertyOwnership.count).mockResolvedValue(v.salesMissingPrice as never);
  vi.mocked(prisma.paymentLedger.aggregate).mockResolvedValue({
    _sum: { amount: v.billed, amountPaid: v.collected },
  } as never);
  vi.mocked(prisma.paymentLedger.count).mockResolvedValue(v.overdueCount as never);

  vi.mocked(prisma.visaStep.count).mockImplementation((async (args: { where: Record<string, unknown> }) =>
    args.where.status === "COMPLETED" ? v.visaCompleted : v.visaTotal) as never);

  vi.mocked(prisma.rentalStageRecord.count).mockResolvedValue(v.rentalDone as never);
  vi.mocked(prisma.rentalStageRecord.findMany).mockResolvedValue(
    Array.from({ length: v.rentalClients }, (_, i) => ({ userId: `user_${i}` })) as never,
  );

  return v;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTenantMetrics", () => {
  it("returns every roll-up the admin Overview renders", async () => {
    setup();

    const metrics = await getTenantMetrics(TENANT);

    expect(metrics.clients).toEqual({ total: 4, withProperty: 3 });
    expect(metrics.properties).toEqual({ total: 6, sold: 2, availableUnits: 11, listedForRental: 2 });
    expect(metrics.sales).toEqual({ valueRecorded: 850000, missingPrice: 1 });
    expect(metrics.visa).toEqual({ clientsInProgress: 3, stepsCompleted: 5, stepsTotal: 12 });
  });

  it("derives outstanding as billed minus collected", async () => {
    setup();

    const metrics = await getTenantMetrics(TENANT);

    expect(metrics.payments).toEqual({
      billed: 100000,
      collected: 40000,
      outstanding: 60000,
      overdueCount: 2,
    });
  });

  it("clamps outstanding at zero rather than showing a negative balance", async () => {
    // recordTenantPayment already rejects overpayment, so a negative here
    // would mean data written outside the app — in which case "−€400
    // outstanding" helps nobody.
    setup({ billed: 100, collected: 500 });

    const metrics = await getTenantMetrics(TENANT);

    expect(metrics.payments.outstanding).toBe(0);
  });

  it("reports zero, not null, for an empty tenant with no sums to aggregate", async () => {
    setup();
    vi.mocked(prisma.property.aggregate).mockResolvedValue({ _sum: { availableUnits: null } } as never);
    vi.mocked(prisma.propertyOwnership.aggregate).mockResolvedValue({ _sum: { salePrice: null } } as never);
    vi.mocked(prisma.paymentLedger.aggregate).mockResolvedValue({
      _sum: { amount: null, amountPaid: null },
    } as never);

    const metrics = await getTenantMetrics(TENANT);

    expect(metrics.properties.availableUnits).toBe(0);
    expect(metrics.sales.valueRecorded).toBe(0);
    expect(metrics.payments).toEqual({ billed: 0, collected: 0, outstanding: 0, overdueCount: 2 });
  });

  it("computes the letting denominator from the canonical stage count, not stored rows", async () => {
    // Absence of a row means PENDING, so the denominator has to come from
    // the code list — counting rows would make progress read as complete.
    setup({ listedForRental: 3, rentalDone: 4 });

    const metrics = await getTenantMetrics(TENANT);

    expect(metrics.rentals).toEqual({
      unitsListed: 3,
      clientsInProgress: 1,
      stagesCompleted: 4,
      stagesTotal: 30,
    });
  });

  it("counts overdue against the clock, not the stored is_delayed flag", async () => {
    setup();

    await getTenantMetrics(TENANT);

    expect(prisma.paymentLedger.count).toHaveBeenCalledWith({
      where: { tenantId: TENANT, status: { not: "PAID" }, dueDate: { lt: expect.any(Date) } },
    });
  });

  it("counts distinct clients with letting progress, not stage rows", async () => {
    setup();

    await getTenantMetrics(TENANT);

    expect(prisma.rentalStageRecord.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, status: "DONE" },
      select: { userId: true },
      distinct: ["userId"],
    });
  });

  it("scopes every count to the tenant", async () => {
    setup();

    await getTenantMetrics(TENANT);

    for (const call of vi.mocked(prisma.property.count).mock.calls) {
      expect((call[0] as { where: { tenantId: string } }).where.tenantId).toBe(TENANT);
    }
    for (const call of vi.mocked(prisma.user.count).mock.calls) {
      expect((call[0] as { where: { tenantId: string } }).where.tenantId).toBe(TENANT);
    }
  });
});
