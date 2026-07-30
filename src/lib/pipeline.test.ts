import { describe, expect, it } from "vitest";

import {
  CLOSED_STAGE_KEYS,
  DEAL_STAGES,
  FIRST_STAGE,
  LOST_STAGE,
  OPEN_DEAL_STAGES,
  WON_STAGE,
  buildStageColumns,
  calculateForecast,
  contactFullName,
  dealStageLabel,
  hasRequiredDocument,
  isClosedStage,
  isKnownDealStage,
  positionForIndex,
  requiredDocumentFor,
  type DealView,
} from "@/lib/pipeline";

function makeDeal(overrides: Partial<DealView> = {}): DealView {
  return {
    id: "d1",
    title: "2-bed in Athens",
    stage: "LEAD",
    stageLabel: "Lead",
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
    documentCategories: [],
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
    expect(isClosedStage("BUYER")).toBe(true);
    expect(isClosedStage("LOST")).toBe(true);
    expect(isClosedStage("POWER_OF_ATTORNEY")).toBe(false);
    // An unknown stage is not closed — being generous here keeps a deal
    // visible rather than silently vanishing from the board.
    expect(isClosedStage("MYSTERY")).toBe(false);
  });

  it("excludes the two terminal stages from the board columns", () => {
    expect(OPEN_DEAL_STAGES).toHaveLength(4);
    expect(OPEN_DEAL_STAGES.map((s) => s.key)).not.toContain("BUYER");
    expect(OPEN_DEAL_STAGES.map((s) => s.key)).not.toContain("LOST");
  });

  it("orders stages without gaps or duplicates", () => {
    expect(DEAL_STAGES.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6]);
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
    expect(dealStageLabel("LEAD")).toBe("Lead");
    expect(dealStageLabel("MYSTERY")).toBe("MYSTERY");
  });

  it("is the business's real funnel, not a generic sales template", () => {
    // This list replaced NEW_LEAD/QUALIFIED/VIEWING/OFFER/RESERVATION/
    // CONTRACT/WON/LOST, which described a process this business does not
    // run. Pinned here so a future "tidy-up" toward generic CRM vocabulary
    // fails loudly rather than silently re-breaking every conversion metric.
    expect(DEAL_STAGES.map((stage) => stage.key)).toEqual([
      "LEAD",
      "ZOOM_MEETING",
      "ATHENS_VISIT",
      "POWER_OF_ATTORNEY",
      "BUYER",
      "LOST",
    ]);
  });

  it("names its boundary stages rather than leaving them as literals", () => {
    expect(FIRST_STAGE).toBe("LEAD");
    expect(WON_STAGE).toBe("BUYER");
    expect(LOST_STAGE).toBe("LOST");
    expect([...CLOSED_STAGE_KEYS].sort()).toEqual(["BUYER", "LOST"]);
  });

  it("keeps CLOSED_STAGE_KEYS in step with the stage list", () => {
    // A query meaning "open deals" filters on this constant; if it ever
    // disagreed with isClosed, those queries would silently include or drop
    // a whole stage.
    const closedByFlag = DEAL_STAGES.filter((stage) => stage.isClosed).map((s) => s.key);
    expect([...CLOSED_STAGE_KEYS].sort()).toEqual(closedByFlag.sort());
  });
});

describe("stage document requirements", () => {
  it("requires a notarised POA at the power-of-attorney stage", () => {
    // The funnel's fourth step is not a status someone ticks — it is an
    // instrument that either exists or does not.
    expect(requiredDocumentFor("POWER_OF_ATTORNEY")).toBe("POWER_OF_ATTORNEY");
  });

  it("requires a signed contract to call someone a buyer", () => {
    expect(requiredDocumentFor("BUYER")).toBe("SALE_CONTRACT");
  });

  it("requires nothing at the early stages, or for an unknown one", () => {
    expect(requiredDocumentFor("LEAD")).toBeNull();
    expect(requiredDocumentFor("ZOOM_MEETING")).toBeNull();
    expect(requiredDocumentFor("ATHENS_VISIT")).toBeNull();
    expect(requiredDocumentFor("MYSTERY")).toBeNull();
  });

  it("passes a stage that needs nothing, whatever is on file", () => {
    // Callers use this uniformly without first asking whether the question
    // applies to the stage they are looking at.
    expect(hasRequiredDocument("LEAD", [])).toBe(true);
  });

  it("detects the discrepancy when a stage's paperwork is absent", () => {
    expect(hasRequiredDocument("POWER_OF_ATTORNEY", [])).toBe(false);
    expect(hasRequiredDocument("POWER_OF_ATTORNEY", ["IDENTITY"])).toBe(false);
    expect(hasRequiredDocument("POWER_OF_ATTORNEY", ["POWER_OF_ATTORNEY"])).toBe(true);
  });

  it("is satisfied when the right document sits among others", () => {
    expect(
      hasRequiredDocument("BUYER", ["IDENTITY", "SALE_CONTRACT", "PAYMENT_RECEIPT"]),
    ).toBe(true);
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
    // An empty "Athens visit" column is information, and it is also where a card
    // has to be droppable.
    const columns = buildStageColumns([]);

    expect(columns).toHaveLength(4);
    expect(columns.every((column) => column.deals.length === 0)).toBe(true);
  });

  it("puts each deal in its own stage, ordered by position", () => {
    const columns = buildStageColumns([
      makeDeal({ id: "b", stage: "ATHENS_VISIT", position: 2000 }),
      makeDeal({ id: "a", stage: "ATHENS_VISIT", position: 1000 }),
      makeDeal({ id: "c", stage: "ZOOM_MEETING" }),
    ]);

    const visit = columns.find((column) => column.stage.key === "ATHENS_VISIT")!;
    expect(visit.deals.map((deal) => deal.id)).toEqual(["a", "b"]);
    expect(columns.find((column) => column.stage.key === "ZOOM_MEETING")!.deals).toHaveLength(1);
  });

  it("totals known values and reports how many are missing, rather than hiding the gap", () => {
    const columns = buildStageColumns([
      makeDeal({ id: "a", stage: "ATHENS_VISIT", value: 100000 }),
      makeDeal({ id: "b", stage: "ATHENS_VISIT", value: null }),
    ]);

    const offer = columns.find((column) => column.stage.key === "ATHENS_VISIT")!;
    // A total that quietly excludes an unpriced deal is a number that lies by
    // omission — the count travels with it so the UI can say so.
    expect(offer.total).toBe(100000);
    expect(offer.missingValueCount).toBe(1);
  });

  it("leaves closed deals off the board", () => {
    const columns = buildStageColumns([
      makeDeal({ id: "w", stage: "BUYER" }),
      makeDeal({ id: "l", stage: "LOST" }),
    ]);

    expect(columns.flatMap((column) => column.deals)).toHaveLength(0);
  });
});

describe("calculateForecast", () => {
  it("sums open value and weights it by stage probability", () => {
    const forecast = calculateForecast([
      makeDeal({ id: "a", stage: "LEAD", value: 100000 }), // ×0.1
      makeDeal({ id: "b", stage: "POWER_OF_ATTORNEY", value: 200000 }), // ×0.85
    ]);

    expect(forecast.openValue).toBe(300000);
    expect(forecast.weightedValue).toBeCloseTo(100000 * 0.1 + 200000 * 0.85);
    expect(forecast.openCount).toBe(2);
  });

  it("excludes closed deals from the open figures and counts them separately", () => {
    const forecast = calculateForecast([
      makeDeal({ id: "a", stage: "ATHENS_VISIT", value: 100000 }),
      makeDeal({ id: "w", stage: "BUYER", value: 500000 }),
      makeDeal({ id: "l", stage: "LOST", value: 300000 }),
    ]);

    expect(forecast.openValue).toBe(100000);
    expect(forecast.wonValue).toBe(500000);
    expect(forecast.wonCount).toBe(1);
    expect(forecast.lostCount).toBe(1);
  });

  it("reports unpriced open deals rather than treating them as zero silently", () => {
    const forecast = calculateForecast([
      makeDeal({ id: "a", stage: "ATHENS_VISIT", value: null }),
      makeDeal({ id: "b", stage: "ATHENS_VISIT", value: 50000 }),
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
