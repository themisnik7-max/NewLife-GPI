import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/currentTenant", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/data/notifications", () => ({
  markNotificationRead: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { markNotificationRead } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedMarkNotificationRead = vi.mocked(markNotificationRead);
const mockedRevalidatePath = vi.mocked(revalidatePath);

describe("markNotificationReadAction", () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedMarkNotificationRead.mockReset().mockResolvedValue(undefined);
    mockedRevalidatePath.mockReset();
  });

  it("resolves tenantId and userId itself, server-side, rather than trusting any client-supplied value", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce({
      userId: "user_1",
      tenantId: "tenant-a",
      role: "TENANT",
      email: "demo@example.com",
      name: "Demo Client",
      initials: "DC",
    } as never);

    await markNotificationReadAction("notif-1");

    expect(mockedMarkNotificationRead).toHaveBeenCalledWith("tenant-a", "user_1", "notif-1");
  });

  it("revalidates broadly (root layout) after a successful update, since any page can show the bell", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce({
      userId: "user_1",
      tenantId: "tenant-a",
      role: "TENANT",
      email: "demo@example.com",
      name: "Demo Client",
      initials: "DC",
    } as never);

    await markNotificationReadAction("notif-1");

    expect(mockedRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("throws without calling markNotificationRead when there is no signed-in, synced user", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(null);

    await expect(markNotificationReadAction("notif-1")).rejects.toThrow(/must be signed in/);
    expect(mockedMarkNotificationRead).not.toHaveBeenCalled();
  });

  it("propagates an error thrown by markNotificationRead itself rather than swallowing it", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce({
      userId: "user_1",
      tenantId: "tenant-a",
      role: "TENANT",
      email: "demo@example.com",
      name: "Demo Client",
      initials: "DC",
    } as never);
    mockedMarkNotificationRead.mockRejectedValueOnce(new Error("Notification notif-1 was not found for user user_1."));

    await expect(markNotificationReadAction("notif-1")).rejects.toThrow(/was not found for user/);
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });
});
