import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn().mockReturnValue({});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

// supabaseClient.ts reads process.env.NEXT_PUBLIC_SUPABASE_URL/ANON_KEY into
// top-level `const`s at module-evaluation time, once. A plain static import
// would only ever see whatever env value happened to exist the first time
// any test file imported the module. vi.resetModules() + a fresh dynamic
// import() per test is what forces re-evaluation against each test's own
// vi.stubEnv() values.
async function importGetSupabaseClient() {
  const mod = await import("@/lib/supabaseClient");
  return mod.getSupabaseClient;
}

describe("getSupabaseClient", () => {
  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the Supabase URL and anon key from environment variables", async () => {
    const getSupabaseClient = await importGetSupabaseClient();

    getSupabaseClient("some-token");

    expect(createClientMock).toHaveBeenCalledWith(
      "https://test-project.supabase.co",
      "test-anon-key",
      expect.anything(),
    );
  });

  it("attaches the Clerk token as a static Authorization bearer header when provided", async () => {
    const getSupabaseClient = await importGetSupabaseClient();

    getSupabaseClient("clerk-token-123");

    expect(createClientMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        global: { headers: { Authorization: "Bearer clerk-token-123" } },
      }),
    );
  });

  it("omits the global headers option entirely when no token is given", async () => {
    const getSupabaseClient = await importGetSupabaseClient();

    getSupabaseClient(null);

    expect(createClientMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ global: undefined }),
    );
  });

  it("omits the global headers option when called with no argument at all", async () => {
    const getSupabaseClient = await importGetSupabaseClient();

    getSupabaseClient();

    expect(createClientMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ global: undefined }),
    );
  });

  it("always disables session persistence and auto-refresh, regardless of token", async () => {
    const getSupabaseClient = await importGetSupabaseClient();

    getSupabaseClient("clerk-token-123");

    expect(createClientMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  });

  it("builds a fresh client on every call rather than sharing a singleton", async () => {
    const getSupabaseClient = await importGetSupabaseClient();

    getSupabaseClient("token-a");
    getSupabaseClient("token-b");

    expect(createClientMock).toHaveBeenCalledTimes(2);
    expect(createClientMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ global: { headers: { Authorization: "Bearer token-a" } } }),
    );
    expect(createClientMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ global: { headers: { Authorization: "Bearer token-b" } } }),
    );
  });
});
