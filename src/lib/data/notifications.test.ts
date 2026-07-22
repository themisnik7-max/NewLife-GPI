import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { createNotification, getUserNotifications, markNotificationRead } from "@/lib/data/notifications";
import { prisma } from "@/lib/prisma";

const mockedFindMany = vi.mocked(prisma.notification.findMany);
const mockedUpdateMany = vi.mocked(prisma.notification.updateMany);
const mockedCreate = vi.mocked(prisma.notification.create);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const USER_1 = "user_abc123";

beforeEach(() => {
  mockedFindMany.mockReset();
  mockedUpdateMany.mockReset();
  mockedCreate.mockReset();
});

describe("getUserNotifications", () => {
  it("queries strictly by tenantId and userId, newest first, capped at 20", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    await getUserNotifications(TENANT_A, USER_1);

    expect(mockedFindMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A, userId: USER_1 },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  });

  it("maps each row to an ISO-formatted, read-flagged entry", async () => {
    mockedFindMany.mockResolvedValueOnce([
      {
        id: "notif-1",
        tenantId: TENANT_A,
        userId: USER_1,
        message: "Welcome to NewLife GPI!",
        read: false,
        createdAt: new Date("2026-02-01T10:30:00.000Z"),
      },
    ] as never);

    const result = await getUserNotifications(TENANT_A, USER_1);

    expect(result).toEqual([
      { id: "notif-1", message: "Welcome to NewLife GPI!", read: false, createdAt: "2026-02-01T10:30:00.000Z" },
    ]);
  });

  it("returns an empty array for a tenant/user combination with no notifications", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    const result = await getUserNotifications(TENANT_B, USER_1);

    expect(result).toEqual([]);
  });
});

describe("markNotificationRead", () => {
  it("updates using an atomic {id, tenantId, userId} filter", async () => {
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 });

    await markNotificationRead(TENANT_A, USER_1, "notif-1");

    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "notif-1", tenantId: TENANT_A, userId: USER_1 },
      data: { read: true },
    });
  });

  it("throws when the notification does not belong to the given tenant/user, rather than silently no-opping", async () => {
    mockedUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(markNotificationRead(TENANT_B, USER_1, "notif-1")).rejects.toThrow(/was not found/);
  });
});

describe("createNotification", () => {
  it("creates a notification with the given tenantId, userId, and message", async () => {
    mockedCreate.mockResolvedValueOnce({} as never);

    await createNotification(TENANT_A, USER_1, "Payment of €400.00 recorded.");

    expect(mockedCreate).toHaveBeenCalledWith({
      data: { tenantId: TENANT_A, userId: USER_1, message: "Payment of €400.00 recorded." },
    });
  });
});
