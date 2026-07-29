// Client/test-safe: the model registry, the determinism policy, and cost
// arithmetic. No network or database access, so this is importable anywhere
// and testable without either — the actual API call lives in
// src/lib/ai/client.ts (`server-only`).
//
// Same split as src/lib/pipeline.ts ↔ src/lib/data/pipeline.ts.

/**
 * ⚠️ READ THIS BEFORE CHANGING ANYTHING IN THIS FILE.
 *
 * CLAUDE.md states, as a non-negotiable rule, that every user-facing LLM
 * request must set `temperature: 0.0`, for two stated reasons: determinism,
 * and cost control.
 *
 * That parameter no longer exists on Anthropic's current models. Claude Opus
 * 5, Opus 4.8 and Opus 4.7 REMOVED `temperature`, `top_p` and `top_k` — a
 * request carrying any of them is rejected with a 400. The rule and the API
 * cannot both be satisfied literally on those models.
 *
 * Rather than silently pick a winner, the policy is encoded here, once, as
 * `determinismParamsFor()`:
 *
 *   - On a model that still accepts `temperature`, it sends `temperature: 0`.
 *     The contract is met to the letter.
 *   - On a model where the parameter was removed, it sends
 *     `output_config: { effort: "low" }` instead — Anthropic's documented
 *     replacement for exactly this intent ("if the intent was determinism,
 *     use effort: low with a tighter prompt"), and the lever that also serves
 *     the rule's second stated reason, cost control.
 *
 * Because the choice is derived from the model rather than written at each
 * call site, there is exactly one place to audit, and adding a second LLM
 * feature cannot get it wrong. `SUPPORTS_TEMPERATURE` below is the switch.
 *
 * If the business would rather have the literal parameter than the current
 * model, set AI_MODEL to a model whose row says `supportsTemperature: true`
 * — no code change is needed.
 */

export interface ModelDefinition {
  id: string;
  label: string;
  /** USD per million input tokens. */
  inputCostPerMillion: number;
  /** USD per million output tokens. */
  outputCostPerMillion: number;
  /**
   * Whether this model still accepts the `temperature` parameter.
   *
   * False on Opus 4.7 and later, where the sampling parameters were removed
   * and sending one returns a 400. See the note at the top of this file.
   */
  supportsTemperature: boolean;
}

/**
 * The models this application is willing to call, with their published
 * per-token prices. Prices are recorded here rather than fetched because a
 * cost figure written into AiLog must reflect what was charged at the time
 * of the call — a rate looked up later would silently rewrite history.
 */
export const AI_MODELS: ReadonlyArray<ModelDefinition> = [
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    inputCostPerMillion: 5,
    outputCostPerMillion: 25,
    supportsTemperature: false,
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
    supportsTemperature: false,
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    inputCostPerMillion: 5,
    outputCostPerMillion: 25,
    // The most capable model that still accepts `temperature`, and therefore
    // the one to pin if CLAUDE.md's literal wording must hold.
    supportsTemperature: true,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
    supportsTemperature: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    inputCostPerMillion: 1,
    outputCostPerMillion: 5,
    supportsTemperature: true,
  },
];

export const AI_MODEL_BY_ID: ReadonlyMap<string, ModelDefinition> = new Map(
  AI_MODELS.map((model) => [model.id, model]),
);

/** The default when AI_MODEL is unset. */
export const DEFAULT_AI_MODEL = "claude-opus-5";

export function resolveModel(id: string | undefined | null): ModelDefinition {
  const model = AI_MODEL_BY_ID.get(id?.trim() || DEFAULT_AI_MODEL);
  if (!model) {
    // Throws rather than silently falling back to the default: a typo in an
    // environment variable that quietly bills a different model, at a
    // different price, is worse than a loud failure at startup.
    throw new Error(
      `Unrecognized AI model "${id}". Known models: ${AI_MODELS.map((m) => m.id).join(", ")}.`,
    );
  }
  return model;
}

/**
 * The determinism half of the request body, per CLAUDE.md's rule and the
 * reasoning at the top of this file. This is the ONLY place either parameter
 * is set — no call site may add its own.
 */
export function determinismParamsFor(model: ModelDefinition): Record<string, unknown> {
  if (model.supportsTemperature) {
    return { temperature: 0.0 };
  }
  return { output_config: { effort: "low" } };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Cost in USD for one call.
 *
 * Returned to four decimal places because that is the precision of
 * `AiLog.cost` (`Decimal(10, 4)`); rounding here rather than at the database
 * boundary means the number written and the number displayed are the same
 * number, instead of two values that disagree in the last digit.
 *
 * Cache-read and cache-write tokens are deliberately NOT modelled. Nothing in
 * this application sets `cache_control` yet, so those fields are always zero;
 * inventing a pricing tier for a feature that is not in use would be
 * speculative arithmetic that nobody could verify against an invoice.
 */
export function calculateCost(model: ModelDefinition, usage: TokenUsage): number {
  const input = (usage.inputTokens / 1_000_000) * model.inputCostPerMillion;
  const output = (usage.outputTokens / 1_000_000) * model.outputCostPerMillion;
  return Math.round((input + output) * 10_000) / 10_000;
}

/** Formats a cost for display. Sub-cent figures are the normal case here, so
 * a plain currency formatter rounding to €0.00 would render every call as
 * free. */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
