import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockFrom = vi.fn(() => ({ upload: mockUpload, createSignedUrl: mockCreateSignedUrl }));
// Typed with its real three-argument shape so the assertion below can read
// `calls[0][2]` (the options object) — a bare `unknown[]` cast collapses to a
// zero-length tuple and loses that.
const mockCreateClient = vi.fn((_url: string, _key: string, _options?: unknown) => ({
  storage: { from: mockFrom },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options?: unknown) => mockCreateClient(url, key, options),
}));

import { createSignedDownloadUrl, isStorageConfigured, uploadRentalStageFile } from "@/lib/storage";

function makeFile(name: string, type: string, size = 1024): File {
  const file = new File(["x"], name, { type });
  // File size is read-only; override it so size limits can be exercised
  // without allocating real megabytes in a test.
  Object.defineProperty(file, "size", { value: size });
  return file;
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  mockUpload.mockReset().mockResolvedValue({ error: null });
  mockCreateSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: "https://signed" }, error: null });
  mockFrom.mockClear();
  mockCreateClient.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isStorageConfigured", () => {
  it("is true when both the URL and secret key are set", () => {
    expect(isStorageConfigured()).toBe(true);
  });

  it.each(["SUPABASE_URL", "SUPABASE_SECRET_KEY"])("is false when %s is missing", (missing) => {
    vi.stubEnv(missing, "");
    expect(isStorageConfigured()).toBe(false);
  });
});

describe("uploadRentalStageFile", () => {
  const base = { tenantId: "tenant-1", userId: "user-1", stageKey: "ENERGY_CERTIFICATE" as const };

  it("namespaces the path by tenant and user so objects can never collide across tenants", async () => {
    const result = await uploadRentalStageFile({
      ...base,
      slot: "pdf",
      file: makeFile("epc.pdf", "application/pdf"),
    });

    expect(result.path).toMatch(/^tenant-1\/user-1\/ENERGY_CERTIFICATE-\d+\.pdf$/);
    expect(result.filename).toBe("epc.pdf");
  });

  it("uploads without upsert, so re-uploading keeps the object an earlier audit row refers to", async () => {
    await uploadRentalStageFile({ ...base, slot: "pdf", file: makeFile("a.pdf", "application/pdf") });

    expect(mockUpload.mock.calls[0][2]).toMatchObject({ upsert: false, contentType: "application/pdf" });
  });

  it("rejects a content type the slot does not allow", async () => {
    // The browser's `accept` attribute is a convenience, not a control — a
    // hand-rolled request can send anything, so this is enforced here.
    await expect(
      uploadRentalStageFile({ ...base, slot: "pdf", file: makeFile("photo.png", "image/png") }),
    ).rejects.toThrow(/accepts a PDF/);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("names the expected kind in the error for a photo slot too, not just PDF", async () => {
    await expect(
      uploadRentalStageFile({ ...base, slot: "photo", file: makeFile("doc.pdf", "application/pdf") }),
    ).rejects.toThrow(/accepts an image/);
  });

  it("says \"unknown\" rather than an empty string when the browser sends no content type", async () => {
    await expect(
      uploadRentalStageFile({ ...base, slot: "pdf", file: makeFile("mystery", "") }),
    ).rejects.toThrow(/received "unknown"/);
  });

  it("accepts each allowed image type for a photo slot", async () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      await expect(
        uploadRentalStageFile({ ...base, slot: "photo", file: makeFile("p.jpg", type) }),
      ).resolves.toBeTruthy();
    }
  });

  it("rejects a file over the size cap", async () => {
    await expect(
      uploadRentalStageFile({
        ...base,
        slot: "pdf",
        file: makeFile("big.pdf", "application/pdf", 11 * 1024 * 1024),
      }),
    ).rejects.toThrow(/too large/);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("falls back to a .bin extension for a filename with none", async () => {
    const result = await uploadRentalStageFile({
      ...base,
      slot: "pdf",
      file: makeFile("noextension", "application/pdf"),
    });

    expect(result.path).toMatch(/\.bin$/);
  });

  it("surfaces a storage error rather than reporting a phantom success", async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: "bucket not found" } });

    await expect(
      uploadRentalStageFile({ ...base, slot: "pdf", file: makeFile("a.pdf", "application/pdf") }),
    ).rejects.toThrow(/bucket not found/);
  });

  it("throws a configuration error, not a crash, when the secret key is absent", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");

    await expect(
      uploadRentalStageFile({ ...base, slot: "pdf", file: makeFile("a.pdf", "application/pdf") }),
    ).rejects.toThrow(/File storage is not configured/);
  });

  it("disables session persistence, which would leak state between serverless invocations", async () => {
    await uploadRentalStageFile({ ...base, slot: "pdf", file: makeFile("a.pdf", "application/pdf") });

    expect(mockCreateClient.mock.calls[0][2]).toMatchObject({
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });
});

describe("createSignedDownloadUrl", () => {
  it("mints a short-lived URL rather than exposing the private object path", async () => {
    const url = await createSignedDownloadUrl("tenant/user/file.pdf");

    expect(url).toBe("https://signed");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("tenant/user/file.pdf", 60);
  });

  it("throws when the signing call fails", async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "not found" } });

    await expect(createSignedDownloadUrl("missing")).rejects.toThrow(/not found/);
  });

  it("throws when signing returns no URL and no error", async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({ data: {}, error: null });

    await expect(createSignedDownloadUrl("missing")).rejects.toThrow(/unknown error/);
  });
});
