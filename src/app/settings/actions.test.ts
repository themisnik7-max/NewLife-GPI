import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth/currentTenant", () => ({
  getCurrentTenantId: vi.fn(),
}));

vi.mock("@/lib/data/apiKeys", () => ({
  revokeTenantApiKey: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { revokeTenantApiKey } from "@/lib/data/apiKeys";
import { revokeApiKeyAction } from "@/app/settings/actions";

const mockedAuth = vi.mocked(auth);
const mockedGetCurrentTenantId = vi.mocked(getCurrentTenantId);
const mockedRevokeTenantApiKey = vi.mocked(revokeTenantApiKey);
const mockedRevalidatePath = vi.mocked(revalidatePath);

describe("revokeApiKeyAction", () => {
  beforeEach(() => {
    mockedAuth.mockReset();
    mockedGetCurrentTenantId.mockReset();
    mockedRevokeTenantApiKey.mockReset().mockResolvedValue(undefined);
    mockedRevalidatePath.mockReset();
  });

  it("resolves tenantId and userId itself, server-side, rather than trusting any client-supplied value", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_1" } as never);
    mockedGetCurrentTenantId.mockResolvedValueOnce("tenant-a");

    await revokeApiKeyAction("key-1");

    expect(mockedRevokeTenantApiKey).toHaveBeenCalledWith("tenant-a", "user_1", "key-1");
  });

  it("revalidates the settings page after a successful revoke", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_1" } as never);
    mockedGetCurrentTenantId.mockResolvedValueOnce("tenant-a");

    await revokeApiKeyAction("key-1");

    expect(mockedRevalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("throws without calling revokeTenantApiKey when there is no signed-in user", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: null } as never);
    mockedGetCurrentTenantId.mockResolvedValueOnce("tenant-a");

    await expect(revokeApiKeyAction("key-1")).rejects.toThrow(/must be signed in/);
    expect(mockedRevokeTenantApiKey).not.toHaveBeenCalled();
  });

  it("throws without calling revokeTenantApiKey when there is no synced tenant yet", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_1" } as never);
    mockedGetCurrentTenantId.mockResolvedValueOnce(null);

    await expect(revokeApiKeyAction("key-1")).rejects.toThrow(/must be signed in/);
    expect(mockedRevokeTenantApiKey).not.toHaveBeenCalled();
  });

  it("propagates an error thrown by revokeTenantApiKey itself (e.g. a mismatched tenant) rather than swallowing it", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_1" } as never);
    mockedGetCurrentTenantId.mockResolvedValueOnce("tenant-a");
    mockedRevokeTenantApiKey.mockRejectedValueOnce(new Error("API key key-1 was not found for tenant tenant-a."));

    await expect(revokeApiKeyAction("key-1")).rejects.toThrow(/was not found for tenant/);
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });
});
