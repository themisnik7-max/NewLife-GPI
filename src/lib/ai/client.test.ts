import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiLog: {
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

vi.mock("@/lib/data/apiKeys", () => ({
  getDecryptedApiKey: vi.fn(),
}));

import { getAiUsage, runAiRequest } from "@/lib/ai/client";
import { prisma } from "@/lib/prisma";
import { getDecryptedApiKey } from "@/lib/data/apiKeys";

const mockedLogCreate = vi.mocked(prisma.aiLog.create);
const mockedLogUpdate = vi.mocked(prisma.aiLog.update);
const mockedLogCount = vi.mocked(prisma.aiLog.count);
const mockedLogAggregate = vi.mocked(prisma.aiLog.aggregate);
const mockedGetKey = vi.mocked(getDecryptedApiKey);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const KEY_ID = "22222222-2222-2222-2222-222222222222";

const REQUEST = {
  tenantId: TENANT_A,
  apiKeyId: KEY_ID,
  agentAction: "client_brief",
  system: "You are an assistant.",
  prompt: "Summarise this client.",
};

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  } as unknown as Response;
}

const SUCCESS_BODY = {
  content: [{ type: "text", text: "Everything is on track." }],
  usage: { input_tokens: 1000, output_tokens: 200 },
  stop_reason: "end_turn",
  model: "claude-opus-5",
};

beforeEach(() => {
  vi.stubEnv("AI_MODEL", "claude-opus-5");
  mockedLogCreate.mockReset().mockResolvedValue({ id: "log-1" } as never);
  mockedLogUpdate.mockReset().mockResolvedValue({} as never);
  mockedLogCount.mockReset().mockResolvedValue(0 as never);
  mockedLogAggregate.mockReset();
  mockedGetKey.mockReset().mockResolvedValue("sk-ant-test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(SUCCESS_BODY)));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function lastRequestBody(): Record<string, unknown> {
  const mockedFetch = vi.mocked(globalThis.fetch);
  const [, init] = mockedFetch.mock.calls[0];
  return JSON.parse((init as RequestInit).body as string);
}

describe("BYOK", () => {
  it("uses the tenant's own decrypted key", async () => {
    await runAiRequest(REQUEST);

    expect(mockedGetKey).toHaveBeenCalledWith(TENANT_A, KEY_ID);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test-key");
  });

  it("refuses to call the provider at all when the tenant has no usable key", async () => {
    // Silently substituting a platform key is exactly what BYOK exists to
    // prevent — ARCHITECTURE.md forbids the fallback explicitly.
    mockedGetKey.mockResolvedValueOnce(null);

    await expect(runAiRequest(REQUEST)).rejects.toThrow(/No usable API key/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("never puts the key in the log row", async () => {
    await runAiRequest(REQUEST);

    const logged = JSON.stringify([
      mockedLogCreate.mock.calls[0][0],
      mockedLogUpdate.mock.calls[0][0],
    ]);
    expect(logged).not.toContain("sk-ant-test-key");
  });
});

describe("the determinism rule on the wire", () => {
  it("sends effort: low and no temperature on a model that removed it", async () => {
    await runAiRequest(REQUEST);

    const body = lastRequestBody();
    expect(body).not.toHaveProperty("temperature");
    expect(body.output_config).toEqual({ effort: "low" });
  });

  it("sends temperature: 0 on a model that still accepts it", async () => {
    vi.stubEnv("AI_MODEL", "claude-sonnet-4-6");

    await runAiRequest(REQUEST);

    const body = lastRequestBody();
    expect(body.temperature).toBe(0);
    expect(body).not.toHaveProperty("output_config");
  });

  it("records which form was used, so past calls stay auditable", async () => {
    await runAiRequest(REQUEST);

    const { data } = mockedLogCreate.mock.calls[0][0] as {
      data: { metadata: { determinism: string; model: string } };
    };
    expect(data.metadata.determinism).toBe("effort=low");
    expect(data.metadata.model).toBe("claude-opus-5");
  });
});

describe("the request", () => {
  it("targets the Messages API with the version header", async () => {
    await runAiRequest(REQUEST);

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("bounds max_tokens so a runaway generation cannot run up a bill", async () => {
    await runAiRequest(REQUEST);

    expect(lastRequestBody().max_tokens).toBe(2000);
  });

  it("sends the system prompt separately from the user turn", async () => {
    await runAiRequest(REQUEST);

    const body = lastRequestBody();
    expect(body.system).toBe("You are an assistant.");
    expect(body.messages).toEqual([{ role: "user", content: "Summarise this client." }]);
  });
});

describe("the response", () => {
  it("returns the text and the computed cost", async () => {
    const result = await runAiRequest(REQUEST);

    expect(result.text).toBe("Everything is on track.");
    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(200);
    // 1000/1M × $5 + 200/1M × $25 = 0.005 + 0.005
    expect(result.costUsd).toBe(0.01);
  });

  it("concatenates every text block rather than reading only the first", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      okResponse({
        ...SUCCESS_BODY,
        content: [
          { type: "text", text: "First part. " },
          { type: "thinking", thinking: "ignored" },
          { type: "text", text: "Second part." },
        ],
      }),
    );

    const result = await runAiRequest(REQUEST);

    expect(result.text).toBe("First part. Second part.");
  });

  it("treats a refusal as an error, checked BEFORE reading content", async () => {
    // A refusal is HTTP 200 with empty content — code that reads the text
    // first sees a blank answer and no reason for it.
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      okResponse({
        content: [],
        usage: { input_tokens: 10, output_tokens: 0 },
        stop_reason: "refusal",
        stop_details: { category: "cyber" },
      }),
    );

    await expect(runAiRequest(REQUEST)).rejects.toThrow(/declined to answer.*cyber/);
  });

  it("errors on an empty response rather than returning a blank brief", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      okResponse({ content: [], usage: {}, stop_reason: "end_turn" }),
    );

    await expect(runAiRequest(REQUEST)).rejects.toThrow(/empty response/);
  });

  it("surfaces a provider error with its status", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({ error: { message: "rate limit exceeded" } }),
    } as unknown as Response);

    await expect(runAiRequest(REQUEST)).rejects.toThrow(/429.*rate limit exceeded/);
  });

  it("treats missing usage figures as zero rather than NaN", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      okResponse({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }),
    );

    const result = await runAiRequest(REQUEST);

    expect(result.inputTokens).toBe(0);
    expect(result.costUsd).toBe(0);
  });
});

describe("AiLog", () => {
  it("opens a RUNNING row before the call, so a crash still leaves a trace", async () => {
    await runAiRequest(REQUEST);

    const { data } = mockedLogCreate.mock.calls[0][0] as {
      data: { status: string; tenantId: string; agentAction: string };
    };
    expect(data.status).toBe("RUNNING");
    expect(data.tenantId).toBe(TENANT_A);
    expect(data.agentAction).toBe("client_brief");
    expect(mockedLogCreate.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(globalThis.fetch).mock.invocationCallOrder[0],
    );
  });

  it("closes the row with tokens and cost on success", async () => {
    await runAiRequest(REQUEST);

    const call = mockedLogUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: { status: string; inputTokens: number; cost: number };
    };
    expect(call.where.id).toBe("log-1");
    expect(call.data.status).toBe("SUCCESS");
    expect(call.data.inputTokens).toBe(1000);
    expect(call.data.cost).toBe(0.01);
  });

  it("records a FAILED row too — a failed call is what someone debugs", async () => {
    mockedGetKey.mockResolvedValueOnce(null);

    await expect(runAiRequest(REQUEST)).rejects.toThrow();

    const { data } = mockedLogUpdate.mock.calls[0][0] as {
      data: { status: string; metadata: { error: string } };
    };
    expect(data.status).toBe("FAILED");
    expect(data.metadata.error).toMatch(/No usable API key/);
  });

  it("does not let a logging failure mask the real error", async () => {
    mockedLogUpdate.mockRejectedValue(new Error("log table unavailable"));
    mockedGetKey.mockResolvedValueOnce(null);

    await expect(runAiRequest(REQUEST)).rejects.toThrow(/No usable API key/);
  });

  it("does not let a logging failure turn a successful call into an error", async () => {
    mockedLogUpdate.mockRejectedValue(new Error("log table unavailable"));

    await expect(runAiRequest(REQUEST)).resolves.toMatchObject({
      text: "Everything is on track.",
    });
  });
});

describe("getAiUsage", () => {
  it("sums cost over successful calls only, but counts failures separately", async () => {
    mockedLogAggregate.mockResolvedValueOnce({
      _sum: { cost: 1.25, inputTokens: 5000, outputTokens: 900 },
    } as never);
    mockedLogCount.mockResolvedValueOnce(10 as never).mockResolvedValueOnce(2 as never);

    const usage = await getAiUsage(TENANT_A);

    const { where } = mockedLogAggregate.mock.calls[0][0] as {
      where: { tenantId: string; status: string };
    };
    expect(where).toEqual({ tenantId: TENANT_A, status: "SUCCESS" });
    expect(usage).toEqual({
      callCount: 10,
      failedCount: 2,
      totalCostUsd: 1.25,
      inputTokens: 5000,
      outputTokens: 900,
    });
  });

  it("reports zero rather than null for a tenant that has never used AI", async () => {
    mockedLogAggregate.mockResolvedValueOnce({
      _sum: { cost: null, inputTokens: null, outputTokens: null },
    } as never);

    await expect(getAiUsage(TENANT_A)).resolves.toMatchObject({
      totalCostUsd: 0,
      inputTokens: 0,
    });
  });
});
