import "server-only";
import { prisma } from "@/lib/prisma";
import { getDecryptedApiKey } from "@/lib/data/apiKeys";
import {
  calculateCost,
  determinismParamsFor,
  resolveModel,
  type ModelDefinition,
} from "@/lib/ai/models";

/**
 * The one place this application talks to an LLM provider.
 *
 * ⚠️ WHY RAW `fetch` AND NOT THE ANTHROPIC SDK. Anthropic's official
 * `@anthropic-ai/sdk` is the recommended client and would be the better
 * choice here. It is not used because CLAUDE.md fixes the dependency set and
 * requires explicit approval before anything is added, and installing an SDK
 * is exactly that. The Messages API is a single JSON POST, so the cost of
 * calling it directly is low — but this is a deliberate constraint, not a
 * preference, and swapping in the SDK later touches only this file.
 *
 * ⚠️ BYOK IS THE WHOLE POINT. The key comes from the tenant's own encrypted
 * credential (ARCHITECTURE.md), decrypted at the moment of use and never
 * logged, never returned, and never substituted with a platform key when the
 * tenant has none — a tenant with no key gets a clear error, because silently
 * billing Anthropic usage to the platform is precisely what BYOK exists to
 * prevent.
 *
 * ⚠️ EVERY CALL IS LOGGED TO AiLog, including failures. That table has been
 * in the schema since day one with nothing writing to it; this module is its
 * first writer.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Bounded so a runaway generation cannot produce an unbounded bill. Well
 * under the streaming threshold, so a non-streaming request is safe. */
const MAX_OUTPUT_TOKENS = 2000;

const REQUEST_TIMEOUT_MS = 60_000;

export interface AiRequest {
  tenantId: string;
  /** Which encrypted credential to use — always a key of this tenant's. */
  apiKeyId: string;
  /** Recorded on AiLog so spend can be attributed per feature. */
  agentAction: string;
  system: string;
  prompt: string;
  /** Extra context for the log row; never includes client-identifying text. */
  metadata?: Record<string, unknown>;
}

export interface AiResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: AnthropicUsage;
  stop_reason?: string;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
  model?: string;
}

/**
 * The model this deployment calls, from AI_MODEL or the default.
 *
 * Read per call rather than cached at module load so changing the variable
 * takes effect on redeploy without a cold-start dependency, and so a bad
 * value surfaces on the request that used it rather than at import time in
 * an unrelated code path.
 */
function currentModel(): ModelDefinition {
  return resolveModel(process.env.AI_MODEL);
}

export function isAiConfigured(): boolean {
  // Deliberately does NOT check for a key: whether a tenant has supplied one
  // is a per-tenant question answered by getTenantApiKeys(), not a
  // deployment-level one. This only answers "is the model setting sane".
  try {
    currentModel();
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts the assistant's text.
 *
 * Concatenates every text block rather than reading `content[0]`: a response
 * can legitimately contain several, and taking only the first silently
 * truncates. Non-text blocks are skipped rather than stringified.
 */
function extractText(response: AnthropicMessageResponse): string {
  return (response.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("")
    .trim();
}

/**
 * Sends one prompt and records the result.
 *
 * The AiLog row is written on both paths — success and failure — because a
 * failed call still consumed a key, still took time, and is exactly what
 * someone debugging "why is the brief button not working" needs to see.
 * ARCHITECTURE.md requires it explicitly: "Key decryption failures or
 * provider auth failures must be caught and logged rather than causing
 * silent fallthrough."
 */
export async function runAiRequest(request: AiRequest): Promise<AiResponse> {
  const model = currentModel();

  const logId = await startLog(request, model);

  try {
    const apiKey = await getDecryptedApiKey(request.tenantId, request.apiKeyId);
    if (!apiKey) {
      // getDecryptedApiKey returns null uniformly for missing, wrong-tenant
      // and revoked — so this message deliberately does not guess which.
      throw new Error(
        "No usable API key for this workspace. Add one under Settings before using AI features.",
      );
    }

    const body = {
      model: model.id,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
      // Spread last so the determinism policy cannot be overridden by
      // anything above it. See src/lib/ai/models.ts for why this is a
      // function of the model rather than a literal `temperature: 0`.
      ...determinismParamsFor(model),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let httpResponse: Response;
    try {
      httpResponse = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": ANTHROPIC_VERSION,
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!httpResponse.ok) {
      // The provider's error body can echo request content; only the status
      // and the provider's own message are surfaced, never the raw body.
      const detail = await readErrorMessage(httpResponse);
      throw new Error(`The AI provider rejected the request (${httpResponse.status}): ${detail}`);
    }

    const payload = (await httpResponse.json()) as AnthropicMessageResponse;

    // Checked BEFORE reading content. A refusal returns HTTP 200 with an
    // empty or partial content array, so code that reads the text first sees
    // an empty answer with no explanation of why.
    if (payload.stop_reason === "refusal") {
      throw new Error(
        `The model declined to answer this request${
          payload.stop_details?.category ? ` (${payload.stop_details.category})` : ""
        }.`,
      );
    }

    const text = extractText(payload);
    if (!text) {
      throw new Error("The model returned an empty response.");
    }

    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;
    const costUsd = calculateCost(model, { inputTokens, outputTokens });

    await finishLog(logId, "SUCCESS", { inputTokens, outputTokens, costUsd });

    return { text, inputTokens, outputTokens, costUsd, model: model.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await finishLog(logId, "FAILED", { error: message });
    throw err instanceof Error ? err : new Error(message);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

/**
 * Opens the log row before the call, so a request that hangs or crashes the
 * process still leaves a RUNNING row behind rather than no trace at all —
 * which is what `AiLogStatus.RUNNING` exists to represent.
 */
async function startLog(request: AiRequest, model: ModelDefinition): Promise<string> {
  const row = await prisma.aiLog.create({
    data: {
      tenantId: request.tenantId,
      agentAction: request.agentAction,
      status: "RUNNING",
      metadata: {
        model: model.id,
        // Recorded so an audit can confirm the determinism rule was honoured
        // on every historical call, not just inspected in today's source.
        determinism: model.supportsTemperature ? "temperature=0" : "effort=low",
        ...(request.metadata ?? {}),
      } as never,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Closes the log row. Failures here are swallowed: an observability write
 * must never turn a successful AI call into an error the user sees, and on
 * the failure path it must not mask the real error with a logging one.
 */
async function finishLog(
  logId: string,
  status: "SUCCESS" | "FAILED",
  detail: { inputTokens?: number; outputTokens?: number; costUsd?: number; error?: string },
): Promise<void> {
  await prisma.aiLog
    .update({
      where: { id: logId },
      data: {
        status,
        inputTokens: detail.inputTokens ?? null,
        outputTokens: detail.outputTokens ?? null,
        cost: detail.costUsd ?? null,
        ...(detail.error ? { metadata: { error: detail.error } as never } : {}),
      },
    })
    .catch((err: unknown) => {
      console.error(`Failed to finalise AiLog ${logId}:`, err);
    });
}

export interface AiUsageSummary {
  callCount: number;
  failedCount: number;
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * What this tenant has spent on AI. Admin-only, like every other tenant-wide
 * reader; the page performs the role check.
 */
export async function getAiUsage(tenantId: string): Promise<AiUsageSummary> {
  const [aggregate, callCount, failedCount] = await Promise.all([
    prisma.aiLog.aggregate({
      where: { tenantId, status: "SUCCESS" },
      _sum: { cost: true, inputTokens: true, outputTokens: true },
    }),
    prisma.aiLog.count({ where: { tenantId } }),
    prisma.aiLog.count({ where: { tenantId, status: "FAILED" } }),
  ]);

  return {
    callCount,
    failedCount,
    totalCostUsd: aggregate._sum.cost === null ? 0 : Number(aggregate._sum.cost),
    inputTokens: aggregate._sum.inputTokens ?? 0,
    outputTokens: aggregate._sum.outputTokens ?? 0,
  };
}
