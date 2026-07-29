import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: vi.fn() },
    user: { findMany: vi.fn() },
    deal: { findMany: vi.fn() },
    paymentLedger: { findMany: vi.fn() },
    activity: { findMany: vi.fn() },
    rentalStageRecord: { findMany: vi.fn() },
    visaStep: { findMany: vi.fn() },
    notification: { findFirst: vi.fn(), create: vi.fn() },
    automationRule: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/data/activities", () => ({
  createActivity: vi.fn(),
}));

import {
  createAutomationRule,
  deleteAutomationRule,
  getAutomationRules,
  runAutomations,
  setRuleEnabled,
} from "@/lib/data/automations";
import { createActivity } from "@/lib/data/activities";
import { CLOSED_STAGE_KEYS } from "@/lib/pipeline";
import { prisma } from "@/lib/prisma";

const mockedRuleFindMany = vi.mocked(prisma.automationRule.findMany);
const mockedRuleCreate = vi.mocked(prisma.automationRule.create);
const mockedRuleUpdateMany = vi.mocked(prisma.automationRule.updateMany);
const mockedRuleDeleteMany = vi.mocked(prisma.automationRule.deleteMany);
const mockedUserFindMany = vi.mocked(prisma.user.findMany);
const mockedDealFindMany = vi.mocked(prisma.deal.findMany);
const mockedPaymentFindMany = vi.mocked(prisma.paymentLedger.findMany);
const mockedActivityFindMany = vi.mocked(prisma.activity.findMany);
const mockedRentalFindMany = vi.mocked(prisma.rentalStageRecord.findMany);
const mockedVisaFindMany = vi.mocked(prisma.visaStep.findMany);
const mockedNotificationFindFirst = vi.mocked(prisma.notification.findFirst);
const mockedNotificationCreate = vi.mocked(prisma.notification.create);
const mockedCreateActivity = vi.mocked(createActivity);
const mockedAudit = vi.mocked(prisma.auditLog.create);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const RULE_1 = "22222222-2222-2222-2222-222222222222";
const ACTOR = { tenantId: TENANT_A, actorUserId: "user_admin" };
const NOW = new Date("2026-07-29T12:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

const RULE_ROW = {
  id: RULE_1,
  name: "Chase stalled deals",
  trigger: "DEAL_STALLED",
  thresholdDays: 14,
  action: "NOTIFY",
  messageTemplate: "Chase {{subject}} — no movement.",
  enabled: true,
  lastRunAt: null,
  lastMatchCount: null,
};

beforeEach(() => {
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (tx: unknown) => unknown) => cb(prisma)) as never);
  mockedRuleFindMany.mockReset().mockResolvedValue([] as never);
  mockedRuleCreate.mockReset().mockResolvedValue(RULE_ROW as never);
  mockedRuleUpdateMany.mockReset().mockResolvedValue({ count: 1 } as never);
  mockedRuleDeleteMany.mockReset().mockResolvedValue({ count: 1 } as never);
  mockedUserFindMany.mockReset().mockResolvedValue([{ id: "user_admin" }] as never);
  mockedDealFindMany.mockReset().mockResolvedValue([] as never);
  mockedPaymentFindMany.mockReset().mockResolvedValue([] as never);
  mockedActivityFindMany.mockReset().mockResolvedValue([] as never);
  mockedRentalFindMany.mockReset().mockResolvedValue([] as never);
  mockedVisaFindMany.mockReset().mockResolvedValue([] as never);
  mockedNotificationFindFirst.mockReset().mockResolvedValue(null as never);
  mockedNotificationCreate.mockReset().mockResolvedValue({} as never);
  mockedCreateActivity.mockReset().mockResolvedValue({} as never);
  mockedAudit.mockReset().mockResolvedValue({} as never);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("rule CRUD", () => {
  it("scopes reads to the tenant", async () => {
    await getAutomationRules(TENANT_A);

    const { where } = mockedRuleFindMany.mock.calls[0][0] as { where: { tenantId: string } };
    expect(where.tenantId).toBe(TENANT_A);
  });

  it("throws on a rule the engine could not evaluate rather than rendering it as active", async () => {
    mockedRuleFindMany.mockResolvedValueOnce([{ ...RULE_ROW, trigger: "MYSTERY" }] as never);

    await expect(getAutomationRules(TENANT_A)).rejects.toThrow(/unrecognized trigger or action/i);
  });

  it("rejects an invalid rule before writing, reporting every problem", async () => {
    await expect(
      createAutomationRule(ACTOR, {
        name: "",
        trigger: "NONSENSE",
        thresholdDays: null,
        action: "NOTIFY",
        messageTemplate: "",
      }),
    ).rejects.toThrow(/name/);
    expect(mockedRuleCreate).not.toHaveBeenCalled();
  });

  it("takes the tenant and author from the actor, never the input", async () => {
    await createAutomationRule(ACTOR, {
      name: "Chase stalled deals",
      trigger: "DEAL_STALLED",
      thresholdDays: 14,
      action: "NOTIFY",
      messageTemplate: "Chase {{subject}}.",
    });

    const { data } = mockedRuleCreate.mock.calls[0][0] as {
      data: { tenantId: string; createdByUserId: string };
    };
    expect(data.tenantId).toBe(TENANT_A);
    expect(data.createdByUserId).toBe("user_admin");
    expect(mockedAudit).toHaveBeenCalledTimes(1);
  });

  it("refuses to enable or delete another tenant's rule", async () => {
    mockedRuleUpdateMany.mockResolvedValueOnce({ count: 0 } as never);
    await expect(setRuleEnabled(ACTOR, RULE_1, false)).rejects.toThrow(/was not found for tenant/);

    mockedRuleDeleteMany.mockResolvedValueOnce({ count: 0 } as never);
    await expect(deleteAutomationRule(ACTOR, RULE_1)).rejects.toThrow(/was not found for tenant/);
  });
});

describe("the engine", () => {
  it("evaluates only enabled rules", async () => {
    await runAutomations(ACTOR, NOW);

    const { where } = mockedRuleFindMany.mock.calls[0][0] as {
      where: { tenantId: string; enabled: boolean };
    };
    expect(where).toEqual({ tenantId: TENANT_A, enabled: true });
  });

  it("matches a stalled deal and delivers a rendered notification", async () => {
    mockedRuleFindMany.mockResolvedValueOnce([RULE_ROW] as never);
    mockedDealFindMany.mockResolvedValueOnce([
      { id: "d1", title: "2-bed in Athens", updatedAt: daysAgo(20) },
    ] as never);

    const [result] = await runAutomations(ACTOR, NOW);

    expect(result).toMatchObject({ matched: 1, suppressed: 0, delivered: 1 });
    const { data } = mockedNotificationCreate.mock.calls[0][0] as {
      data: { message: string; userId: string; tenantId: string };
    };
    expect(data.message).toBe("Chase 2-bed in Athens — no movement.");
    expect(data.userId).toBe("user_admin");
    expect(data.tenantId).toBe(TENANT_A);
  });

  it("does not match a deal touched inside the threshold", async () => {
    mockedRuleFindMany.mockResolvedValueOnce([RULE_ROW] as never);
    mockedDealFindMany.mockResolvedValueOnce([
      { id: "d1", title: "Fresh deal", updatedAt: daysAgo(2) },
    ] as never);

    const [result] = await runAutomations(ACTOR, NOW);

    expect(result.matched).toBe(0);
    expect(mockedNotificationCreate).not.toHaveBeenCalled();
  });

  it("excludes closed deals from the stalled query", async () => {
    mockedRuleFindMany.mockResolvedValueOnce([RULE_ROW] as never);

    await runAutomations(ACTOR, NOW);

    const { where } = mockedDealFindMany.mock.calls[0][0] as {
      where: { stage: { notIn: string[] } };
    };
    // Asserted against the exported constant rather than string literals, so
    // renaming a terminal stage cannot leave this query silently stale.
    expect(where.stage.notIn).toEqual([...CLOSED_STAGE_KEYS]);
  });

  it("suppresses a repeat nudge about the same subject", async () => {
    // Re-nudging every time someone clicks Run is how an automation gets
    // muted rather than fixed.
    mockedRuleFindMany.mockResolvedValueOnce([RULE_ROW] as never);
    mockedDealFindMany.mockResolvedValueOnce([
      { id: "d1", title: "2-bed in Athens", updatedAt: daysAgo(20) },
    ] as never);
    mockedNotificationFindFirst.mockResolvedValueOnce({ id: "notif-1" } as never);

    const [result] = await runAutomations(ACTOR, NOW);

    expect(result).toMatchObject({ matched: 1, suppressed: 1, delivered: 0 });
    expect(mockedNotificationCreate).not.toHaveBeenCalled();
  });

  it("creates a task AND a notification for a CREATE_TASK rule", async () => {
    // A task in a record nobody opens today is invisible; the notification
    // is what makes it noticed.
    mockedRuleFindMany.mockResolvedValueOnce([{ ...RULE_ROW, action: "CREATE_TASK" }] as never);
    mockedDealFindMany.mockResolvedValueOnce([
      { id: "d1", title: "2-bed in Athens", updatedAt: daysAgo(20) },
    ] as never);

    await runAutomations(ACTOR, NOW);

    expect(mockedCreateActivity).toHaveBeenCalledWith(
      ACTOR,
      expect.objectContaining({ type: "TASK", entityType: "Deal", entityId: "d1", dueAt: NOW }),
    );
    expect(mockedNotificationCreate).toHaveBeenCalledTimes(1);
  });

  it("finds overdue payments against the clock, not a stored flag", async () => {
    mockedRuleFindMany.mockResolvedValueOnce([
      { ...RULE_ROW, trigger: "PAYMENT_OVERDUE", thresholdDays: null },
    ] as never);
    mockedPaymentFindMany.mockResolvedValueOnce([
      { id: "p1", amount: 15000, user: { firstName: "Maria", lastName: "P", email: "m@e.com" } },
    ] as never);

    const [result] = await runAutomations(ACTOR, NOW);

    const { where } = mockedPaymentFindMany.mock.calls[0][0] as {
      where: { status: { not: string }; dueDate: { lt: Date } };
    };
    expect(where.status).toEqual({ not: "PAID" });
    expect(where.dueDate.lt).toBe(NOW);
    expect(result.delivered).toBe(1);
  });

  it("raises one rental-stall match per client, on their most recent stage", async () => {
    // Matching per row would fire once for every stage they ever completed.
    mockedRuleFindMany.mockResolvedValueOnce([
      { ...RULE_ROW, trigger: "RENTAL_STAGE_STALLED", thresholdDays: 21 },
    ] as never);
    mockedRentalFindMany.mockResolvedValueOnce([
      { userId: "u1", completedAt: daysAgo(30), user: { firstName: "Li", lastName: null, email: "li@e.com" } },
      { userId: "u1", completedAt: daysAgo(60), user: { firstName: "Li", lastName: null, email: "li@e.com" } },
    ] as never);

    const [result] = await runAutomations(ACTOR, NOW);

    expect(result.matched).toBe(1);
  });

  it("does nothing at all when the tenant has no admins to notify", async () => {
    mockedRuleFindMany.mockResolvedValueOnce([RULE_ROW] as never);
    mockedUserFindMany.mockResolvedValueOnce([] as never);

    const [result] = await runAutomations(ACTOR, NOW);

    expect(result.matched).toBe(0);
    // The subject queries are skipped entirely — work whose result would be
    // discarded is work not done.
    expect(mockedDealFindMany).not.toHaveBeenCalled();
  });

  it("records the run on the rule so 'never matched' and 'never ran' differ", async () => {
    mockedRuleFindMany.mockResolvedValueOnce([RULE_ROW] as never);

    await runAutomations(ACTOR, NOW);

    const call = mockedRuleUpdateMany.mock.calls[0][0] as {
      data: { lastRunAt: Date; lastMatchCount: number };
    };
    expect(call.data.lastRunAt).toBe(NOW);
    expect(call.data.lastMatchCount).toBe(0);
  });

  it("keeps running the other rules when one fails", async () => {
    // A single throw aborting the run means one malformed rule silently
    // disables every automation the business depends on.
    mockedRuleFindMany.mockResolvedValueOnce([
      { ...RULE_ROW, id: "bad", trigger: "MYSTERY" },
      { ...RULE_ROW, id: "good", name: "Good rule" },
    ] as never);
    mockedDealFindMany.mockResolvedValueOnce([
      { id: "d1", title: "Stalled", updatedAt: daysAgo(30) },
    ] as never);

    const results = await runAutomations(ACTOR, NOW);

    expect(results).toHaveLength(2);
    expect(results[0].delivered).toBe(0);
    expect(results[1].delivered).toBe(1);
  });

  it("clears lastMatchCount on a failed rule, so quiet failure is discoverable", async () => {
    mockedRuleFindMany.mockResolvedValueOnce([{ ...RULE_ROW, trigger: "MYSTERY" }] as never);

    await runAutomations(ACTOR, NOW);

    const call = mockedRuleUpdateMany.mock.calls[0][0] as {
      data: { lastMatchCount: number | null };
    };
    expect(call.data.lastMatchCount).toBeNull();
  });

  it("reports per rule rather than a single total", async () => {
    mockedRuleFindMany.mockResolvedValueOnce([RULE_ROW] as never);

    const results = await runAutomations(ACTOR, NOW);

    expect(results[0]).toMatchObject({ ruleId: RULE_1, ruleName: "Chase stalled deals" });
  });
});
