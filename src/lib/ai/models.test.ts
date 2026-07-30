import { describe, expect, it } from "vitest";

import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  calculateCost,
  determinismParamsFor,
  formatCost,
  resolveModel,
} from "@/lib/ai/models";

describe("the determinism policy (CLAUDE.md's temperature rule)", () => {
  it("sends temperature: 0.0 on every model that still accepts it", () => {
    // The literal wording of the rule, honoured wherever the API allows it.
    for (const model of AI_MODELS.filter((m) => m.supportsTemperature)) {
      expect(determinismParamsFor(model)).toEqual({ temperature: 0.0 });
    }
  });

  it("never sends temperature to a model that removed it — that is a 400", () => {
    // Opus 4.7 and later reject temperature/top_p/top_k outright. Sending it
    // would not be "following the rule", it would be breaking every call.
    for (const model of AI_MODELS.filter((m) => !m.supportsTemperature)) {
      expect(determinismParamsFor(model)).not.toHaveProperty("temperature");
    }
  });

  it("substitutes the documented determinism equivalent on those models", () => {
    // effort: low is Anthropic's stated replacement for this exact intent,
    // and also serves the rule's second stated reason, cost control.
    const opus5 = resolveModel("claude-opus-5");
    expect(determinismParamsFor(opus5)).toEqual({ output_config: { effort: "low" } });
  });

  it("never sends top_p or top_k on any model", () => {
    for (const model of AI_MODELS) {
      const params = determinismParamsFor(model);
      expect(params).not.toHaveProperty("top_p");
      expect(params).not.toHaveProperty("top_k");
    }
  });

  it("offers at least one model that satisfies the rule literally", () => {
    // If the business decides the literal parameter matters more than the
    // newest model, AI_MODEL can be pointed at one of these with no code
    // change. This test fails if that escape hatch is ever removed.
    expect(AI_MODELS.some((model) => model.supportsTemperature)).toBe(true);
  });
});

describe("resolveModel", () => {
  it("falls back to the default when unset", () => {
    expect(resolveModel(undefined).id).toBe(DEFAULT_AI_MODEL);
    expect(resolveModel("").id).toBe(DEFAULT_AI_MODEL);
    expect(resolveModel("   ").id).toBe(DEFAULT_AI_MODEL);
  });

  it("throws loudly on an unknown id rather than silently defaulting", () => {
    // A typo in an environment variable that quietly bills a different model
    // at a different price is worse than a startup failure.
    expect(() => resolveModel("claude-opus-6")).toThrow(/Unrecognized AI model/);
  });

  it("lists the known models in the error, so the fix is obvious", () => {
    expect(() => resolveModel("nope")).toThrow(/claude-opus-5/);
  });
});

describe("model registry", () => {
  it("has no duplicate ids and prices every model", () => {
    const ids = AI_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const model of AI_MODELS) {
      expect(model.inputCostPerMillion).toBeGreaterThan(0);
      expect(model.outputCostPerMillion).toBeGreaterThan(0);
      // Output is always dearer than input across Anthropic's line; a row
      // where it is not is almost certainly a transposed pair.
      expect(model.outputCostPerMillion).toBeGreaterThan(model.inputCostPerMillion);
    }
  });

  it("includes the default model", () => {
    expect(() => resolveModel(DEFAULT_AI_MODEL)).not.toThrow();
  });
});

describe("calculateCost", () => {
  it("prices input and output at their separate rates", () => {
    const model = resolveModel("claude-opus-5"); // $5 in, $25 out per MTok

    // 1M input + 1M output = $5 + $25
    expect(calculateCost(model, { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(30);
  });

  it("rounds to four decimals, matching AiLog.cost's Decimal(10, 4)", () => {
    // The number written to the database and the number displayed must be
    // the same number, not two that disagree in the last digit.
    const model = resolveModel("claude-opus-5");
    const cost = calculateCost(model, { inputTokens: 1234, outputTokens: 567 });

    expect(cost).toBe(Number(cost.toFixed(4)));
  });

  it("returns zero for a call that used no tokens", () => {
    expect(calculateCost(resolveModel("claude-opus-5"), { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("prices a cheaper model lower for identical usage", () => {
    const usage = { inputTokens: 100_000, outputTokens: 50_000 };

    expect(calculateCost(resolveModel("claude-haiku-4-5"), usage)).toBeLessThan(
      calculateCost(resolveModel("claude-opus-5"), usage),
    );
  });
});

describe("formatCost", () => {
  it("shows four decimals below a cent, so a real call never reads as free", () => {
    // Typical calls here cost fractions of a cent; a two-decimal formatter
    // would render every one of them as $0.00.
    expect(formatCost(0.0042)).toBe("$0.0042");
  });

  it("shows two decimals above a cent", () => {
    expect(formatCost(1.239)).toBe("$1.24");
  });

  it("shows a bare zero for genuinely zero", () => {
    expect(formatCost(0)).toBe("$0");
  });

  it("returns a dash rather than NaN for a nonsense figure", () => {
    expect(formatCost(Number.NaN)).toBe("—");
    expect(formatCost(-1)).toBe("—");
  });
});
