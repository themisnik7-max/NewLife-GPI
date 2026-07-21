import { describe, expect, it, vi } from "vitest";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// server-only unconditionally throws unless the bundler declares the
// "react-server" export condition, which Vitest's Node/Vite resolution
// never does.
vi.mock("server-only", () => ({}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const mockedAuth = vi.mocked(auth);
const mockedFindUnique = vi.mocked(prisma.user.findUnique);

const TENANT_UUID = "11111111-1111-1111-1111-111111111111";

describe("getCurrentTenantId", () => {
  it("returns null without ever querying the database when there is no signed-in user", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: null } as never);

    const result = await getCurrentTenantId();

    expect(result).toBeNull();
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });

  it("looks up the user by their raw Clerk id string, not a UUID", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_abc123" } as never);
    mockedFindUnique.mockResolvedValueOnce({ tenantId: TENANT_UUID } as never);

    await getCurrentTenantId();

    expect(mockedFindUnique).toHaveBeenCalledWith({
      where: { id: "user_abc123" },
      select: { tenantId: true },
    });
  });

  it("returns the real tenantId UUID column from the database, never the raw Clerk user id itself", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_abc123" } as never);
    mockedFindUnique.mockResolvedValueOnce({ tenantId: TENANT_UUID } as never);

    const result = await getCurrentTenantId();

    expect(result).toBe(TENANT_UUID);
    expect(result).not.toBe("user_abc123");
  });

  it("returns null when the Clerk user has no matching users row yet (webhook hasn't synced this account)", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_new" } as never);
    mockedFindUnique.mockResolvedValueOnce(null);

    const result = await getCurrentTenantId();

    expect(result).toBeNull();
  });
});
