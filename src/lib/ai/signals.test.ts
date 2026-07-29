import { describe, expect, it } from "vitest";

import {
  STALL_THRESHOLD_DAYS,
  daysBetween,
  detectPaymentSignals,
  detectPipelineHealthSignals,
  detectStalledDeals,
  detectTaskSignals,
  signalsToPromptContext,
  sortSignals,
  type DealSignalInput,
  type Signal,
} from "@/lib/ai/signals";

const NOW = new Date("2026-07-29T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeDeal(overrides: Partial<DealSignalInput> = {}): DealSignalInput {
  return {
    id: "d1",
    title: "2-bed in Athens",
    stage: "ATHENS_VISIT",
    stageLabel: "Athens visit",
    value: 250000,
    expectedCloseDate: null,
    updatedAt: daysAgo(1),
    contactName: "Maria Papadopoulos",
    ...overrides,
  };
}

describe("daysBetween", () => {
  it("counts whole days elapsed", () => {
    expect(daysBetween(daysAgo(14), NOW)).toBe(14);
    expect(daysBetween(daysAgo(0), NOW)).toBe(0);
  });

  it("returns a negative count for a future date", () => {
    const future = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysBetween(future, NOW)).toBeLessThan(0);
  });
});

describe("detectStalledDeals", () => {
  it("flags a deal untouched past the threshold", () => {
    const [signal] = detectStalledDeals([makeDeal({ updatedAt: daysAgo(20) })], NOW);

    expect(signal.kind).toBe("deal_stalled");
    // The specific numbers are computed here, not by the model.
    expect(signal.message).toContain("20 days");
    expect(signal.message).toContain("Athens visit");
  });

  it("does not flag a deal touched recently", () => {
    expect(detectStalledDeals([makeDeal({ updatedAt: daysAgo(3) })], NOW)).toEqual([]);
  });

  it("treats the threshold as inclusive", () => {
    expect(detectStalledDeals([makeDeal({ updatedAt: daysAgo(STALL_THRESHOLD_DAYS) })], NOW)).toHaveLength(1);
    expect(
      detectStalledDeals([makeDeal({ updatedAt: daysAgo(STALL_THRESHOLD_DAYS - 1) })], NOW),
    ).toEqual([]);
  });

  it("never flags a closed deal — a Won deal that stopped moving is a sale", () => {
    const stale = { updatedAt: daysAgo(200) };
    expect(detectStalledDeals([makeDeal({ ...stale, stage: "BUYER" })], NOW)).toEqual([]);
    expect(detectStalledDeals([makeDeal({ ...stale, stage: "LOST" })], NOW)).toEqual([]);
  });

  it("escalates a high-value stall to critical", () => {
    // A stalled €500k deal and a stalled €5k deal are not the same problem.
    const [big] = detectStalledDeals([makeDeal({ updatedAt: daysAgo(20), value: 500000 })], NOW);
    const [small] = detectStalledDeals([makeDeal({ updatedAt: daysAgo(20), value: 5000 })], NOW);

    expect(big.severity).toBe("critical");
    expect(small.severity).toBe("warning");
  });

  it("treats an unpriced stalled deal as the lower severity, not the higher", () => {
    const [signal] = detectStalledDeals([makeDeal({ updatedAt: daysAgo(20), value: null })], NOW);
    expect(signal.severity).toBe("warning");
  });

  it("flags a passed expected close date separately", () => {
    const signals = detectStalledDeals(
      [makeDeal({ updatedAt: daysAgo(1), expectedCloseDate: daysAgo(10) })],
      NOW,
    );

    expect(signals.map((s) => s.kind)).toEqual(["deal_close_date_passed"]);
    expect(signals[0].message).toContain("10 days ago");
  });

  it("does not flag a future close date", () => {
    const future = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(detectStalledDeals([makeDeal({ expectedCloseDate: future })], NOW)).toEqual([]);
  });

  it("can raise both signals for one deal", () => {
    const signals = detectStalledDeals(
      [makeDeal({ updatedAt: daysAgo(30), expectedCloseDate: daysAgo(5) })],
      NOW,
    );

    expect(signals.map((s) => s.kind).sort()).toEqual(["deal_close_date_passed", "deal_stalled"]);
  });
});

describe("detectPipelineHealthSignals", () => {
  it("states the forecast gap rather than leaving it to be discovered", () => {
    const [signal] = detectPipelineHealthSignals({
      openCount: 5,
      missingValueCount: 3,
      openValue: 100000,
    });

    expect(signal.kind).toBe("deals_missing_value");
    // Info, not warning — an unpriced early lead is normal, just invisible.
    expect(signal.severity).toBe("info");
    expect(signal.message).toContain("3 open deals");
  });

  it("uses the singular for one unpriced deal", () => {
    const [signal] = detectPipelineHealthSignals({
      openCount: 2,
      missingValueCount: 1,
      openValue: 1,
    });
    expect(signal.message).toContain("1 open deal has");
    expect(signal.message).toContain("excludes it");
  });

  it("flags an empty pipeline", () => {
    const signals = detectPipelineHealthSignals({ openCount: 0, missingValueCount: 0, openValue: 0 });
    expect(signals.map((s) => s.kind)).toEqual(["pipeline_empty"]);
  });

  it("is silent on a healthy pipeline", () => {
    expect(
      detectPipelineHealthSignals({ openCount: 4, missingValueCount: 0, openValue: 500000 }),
    ).toEqual([]);
  });
});

describe("detectPaymentSignals / detectTaskSignals", () => {
  it("treats overdue money as critical and includes the total", () => {
    const [signal] = detectPaymentSignals({ overdueCount: 2, outstanding: 42000 });

    expect(signal.severity).toBe("critical");
    expect(signal.message).toContain("2 installments are");
    expect(signal.message).toContain("42,000");
  });

  it("is silent when nothing is overdue", () => {
    expect(detectPaymentSignals({ overdueCount: 0, outstanding: 10000 })).toEqual([]);
    expect(detectTaskSignals({ overdueTaskCount: 0 })).toEqual([]);
  });

  it("flags overdue tasks as a warning", () => {
    const [signal] = detectTaskSignals({ overdueTaskCount: 3 });
    expect(signal.severity).toBe("warning");
    expect(signal.message).toContain("3 tasks");
  });
});

describe("sortSignals", () => {
  it("puts critical first and info last", () => {
    const signals: Signal[] = [
      { kind: "c", severity: "info", message: "i" },
      { kind: "a", severity: "critical", message: "c" },
      { kind: "b", severity: "warning", message: "w" },
    ];

    expect(sortSignals(signals).map((s) => s.severity)).toEqual(["critical", "warning", "info"]);
  });

  it("preserves the caller's order within a severity band", () => {
    const signals: Signal[] = [
      { kind: "first", severity: "warning", message: "1" },
      { kind: "second", severity: "warning", message: "2" },
    ];

    expect(sortSignals(signals).map((s) => s.kind)).toEqual(["first", "second"]);
  });

  it("does not mutate its input", () => {
    const signals: Signal[] = [
      { kind: "i", severity: "info", message: "i" },
      { kind: "c", severity: "critical", message: "c" },
    ];
    sortSignals(signals);
    expect(signals[0].kind).toBe("i");
  });
});

describe("signalsToPromptContext", () => {
  it("numbers each finding so a hallucinated extra one is obvious", () => {
    const context = signalsToPromptContext([
      { kind: "a", severity: "critical", message: "Two payments overdue." },
      { kind: "b", severity: "warning", message: "One deal stalled." },
    ]);

    expect(context).toBe("1. [critical] Two payments overdue.\n2. [warning] One deal stalled.");
  });

  it("says so explicitly when there is nothing to report", () => {
    // An empty prompt would invite the model to invent something to say.
    expect(signalsToPromptContext([])).toBe("No issues were detected.");
  });
});
