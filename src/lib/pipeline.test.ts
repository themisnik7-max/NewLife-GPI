import { describe, expect, it } from "vitest";

import {
  DEAL_STAGES,
  OPEN_DEAL_STAGES,
  buildStageColumns,
  calculateForecast,
  contactFullName,
  dealStageLabel,
  isClosedStage,
  isKnownDealStage,
  positionForIndex,
  type DealView,
} from "@/lib/pipeline";

function makeDeal(overrides: Partial<DealView> = {}): DealView {
  return {
    id: "d1",
    title: "2-bed in Athens",
    stage: "NEW_LEAD",
    stageLabel: "New lead",
    value: 250000,
    expectedCloseDate: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    position: 1000,
    contactId: "c1",
    contactName: "Maria Papadopoulos",
    contactEmail: "maria@example.com",
    contactClerkUserId: null,
    propertyId: null,
    propertyName: null,
    ownerUserId: "user_admin",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("stage vocabulary", () => {
  it("recognises every canonical stage and rejects anything else", () => {
    for (const stage of DEAL_STAGES) {
      expect(isKnownDealStage(stage.key)).toBe(true);
    }
    expect(isKnownDealStage("NEGOTIATING")).toBe(false);
  });

  it("treats exactly WON and LOST as closed", () => {
    expect(isClosedStage("WON")).toBe(true);
    expect(isClosedStage("LOST")).toBe(true);
    expect(isClosedStage("CONTRACT")).toBe(false);
    // An unknown stage is not closed — being generous here keeps a deal
    // visible rather than silently vanishing from the board.
    expect(isClosedStage("MYSTERY")).toBe(false);
  });

  it("excludes the two terminal stages from the board columns", () => {
    expect(OPEN_DEAL_STAGES).toHaveLength(6);
    expect(OPEN_DEAL_STAGES.map((s) => s.key)).not.toContain("WON");
    expect(OPEN_DEAL_STAGES.map((s) => s.key)).not.toContain("LOST");
  });

  it("orders stages without gaps or duplicates", () => {
    expect(DEAL_STAGES.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(DEAL_STAGES.map((s) => s.key)).size).toBe(DEAL_STAGES.length);
  });

  it("keeps probabilities monotonic through the open stages", () => {
    // A later stage that was less likely to close than an earlier one would
    // make the weighted forecast drop as a deal progresses.
    const probabilities = OPEN_DEAL_STAGES.map((s) => s.probability);
    for (let i = 1; i < probabilities.length; i += 1) {
      expect(probabilities[i]).toBeGreaterThan(probabilities[i - 1]);
    }
  });

  it("labels a known stage and falls back to the raw key otherwise", () => {
    expect(dealStageLabel("NEW_LEAD")).toBe("New lead");
    expect(dealStageLabel("MYSTERY")).toBe("MYSTERY");
  });
});

describe("contactFullName", () => {
  it("joins the parts and copes with a missing surname", () => {
    expect(contactFullName("Maria", "Papadopoulos")).toBe("Maria Papadopoulos");
    expect(contactFullName("Maria", null)).toBe("Maria");
  });
});

describe("buildStageColumns", () => {
  it("renders every open stage as a column even when empty", () => {
    // An empty "Offer" column is information, and it is also where a card
    // has to be droppable.
    const columns = buildStageColumns([]);

    expect(columns).toHaveLength(6);
    expect(columns.every((column) => column.deals.length === 0)).toBe(true);
  });

  it("puts each deal in its own stage, ordered by position", () => {
    const columns = buildStageColumns([
      makeDeal({ id: "b", stage: "OFFER", position: 2000 }),
      makeDeal({ id: "a", stage: "OFFER", position: 1000 }),
      makeDeal({ id: "c", stage: "VIEWING" }),
    ]);

    const offer = columns.find((column) => column.stage.key === "OFFER")!;
    expect(offer.deals.map((deal) => deal.id)).toEqual(["a", "b"]);
    expect(columns.find((column) => column.stage.key === "VIEWING")!.deals).toHaveLength(1);
  });

  it("totals known values and reports how many are missing, rather than hiding the gap", () => {
    const columns = buildStageColumns([
      makeDeal({ id: "a", stage: "OFFER", value: 100000 }),
      makeDeal({ id: "b", stage: "OFFER", value: null }),
    ]);

    const offer = columns.find((column) => column.stage.key === "OFFER")!;
    // A total that quietly excludes an unpriced deal is a number that lies by
    // omission — the count travels with it so the UI can say so.
    expect(offer.total).toBe(100000);
    expect(offer.missingValueCount).toBe(1);
  });

  it("leaves closed deals off the board", () => {
    const columns = buildStageColumns([
      makeDeal({ id: "w", stage: "WON" }),
      makeDeal({ id: "l", stage: "LOST" }),
    ]);

    expect(columns.flatMap((column) => column.deals)).toHaveLength(0);
  });
});

describe("calculateForecast", () => {
  it("sums open value and weights it by stage probability", () => {
    const forecast = calculateForecast([
      makeDeal({ id: "a", stage: "NEW_LEAD", value: 100000 }), // ×0.1
      makeDeal({ id: "b", stage: "CONTRACT", value: 200000 }), // ×0.9
    ]);

    expect(forecast.openValue).toBe(300000);
    expect(forecast.weightedValue).toBeCloseTo(100000 * 0.1 + 200000 * 0.9);
    expect(forecast.openCount).toBe(2);
  });

  it("excludes closed deals from the open figures and counts them separately", () => {
    const forecast = calculateForecast([
      makeDeal({ id: "a", stage: "OFFER", value: 100000 }),
      makeDeal({ id: "w", stage: "WON", value: 500000 }),
      makeDeal({ id: "l", stage: "LOST", value: 300000 }),
    ]);

    expect(forecast.openValue).toBe(100000);
    expect(forecast.wonValue).toBe(500000);
    expect(forecast.wonCount).toBe(1);
    expect(forecast.lostCount).toBe(1);
  });

  it("reports unpriced open deals rather than treating them as zero silently", () => {
    const forecast = calculateForecast([
      makeDeal({ id: "a", stage: "OFFER", value: null }),
      makeDeal({ id: "b", stage: "OFFER", value: 50000 }),
    ]);

    expect(forecast.openValue).toBe(50000);
    expect(forecast.missingValueCount).toBe(1);
  });

  it("returns zeroes for an empty pipeline rather than NaN", () => {
    expect(calculateForecast([])).toEqual({
      openValue: 0,
      weightedValue: 0,
      openCount: 0,
      missingValueCount: 0,
      wonValue: 0,
      wonCount: 0,
      lostCount: 0,
    });
  });
});

describe("positionForIndex", () => {
  it("gives the first card in an empty column a positive position", () => {
    expect(positionForIndex([], 0)).toBe(1000);
  });

  it("returns the midpoint between neighbours, so only one row is rewritten", () => {
    // The entire reason `position` is a float rather than an integer.
    expect(positionForIndex([{ position: 1000 }, { position: 2000 }], 1)).toBe(1500);
  });

  it("steps below the first card and above the last", () => {
    const siblings = [{ position: 1000 }, { position: 2000 }];
    expect(positionForIndex(siblings, 0)).toBe(0);
    expect(positionForIndex(siblings, 2)).toBe(3000);
  });

  it("clamps an index beyond either end instead of producing NaN", () => {
    const siblings = [{ position: 1000 }];
    expect(positionForIndex(siblings, 99)).toBe(2000);
    expect(positionForIndex(siblings, -5)).toBe(0);
  });

  it("keeps producing distinct positions across repeated insertions at the same slot", () => {
    let siblings = [{ position: 1000 }, { position: 2000 }];
    const inserted: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      const next = positionForIndex(siblings, 1);
      inserted.push(next);
      siblings = [siblings[0], { position: next }, ...siblings.slice(1)];
    }

    expect(new Set(inserted).size).toBe(inserted.length);
  });
});
