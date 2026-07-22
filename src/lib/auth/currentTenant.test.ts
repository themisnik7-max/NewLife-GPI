import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentTenantId, getCurrentUser } from "@/lib/auth/currentTenant";
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

// This file previously had no beforeEach at all — harmless while only the
// very first test in the file ever asserted `.not.toHaveBeenCalled()`, but
// adding getCurrentUser's own "no signed-in user" test exposed it: without a
// reset, mockedFindUnique's call count kept accumulating across every test
// that ran before it in the same file.
beforeEach(() => {
  mockedAuth.mockReset();
  mockedFindUnique.mockReset();
});

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

describe("getCurrentUser", () => {
  it("returns null without ever querying the database when there is no signed-in user", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: null } as never);

    const result = await getCurrentUser();

    expect(result).toBeNull();
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when the Clerk user has no matching users row yet", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_new" } as never);
    mockedFindUnique.mockResolvedValueOnce(null);

    const result = await getCurrentUser();

    expect(result).toBeNull();
  });

  it("combines firstName and lastName into a full display name and initials", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_abc123" } as never);
    mockedFindUnique.mockResolvedValueOnce({
      tenantId: TENANT_UUID,
      role: "ADMIN",
      email: "maria@example.com",
      firstName: "Maria",
      lastName: "Papadopoulos",
    } as never);

    const result = await getCurrentUser();

    expect(result).toEqual({
      userId: "user_abc123",
      tenantId: TENANT_UUID,
      role: "ADMIN",
      email: "maria@example.com",
      name: "Maria Papadopoulos",
      initials: "MP",
    });
  });

  it("falls back to the email address as the display name when both firstName and lastName are null", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_noname" } as never);
    mockedFindUnique.mockResolvedValueOnce({
      tenantId: TENANT_UUID,
      role: "TENANT",
      email: "noname@example.com",
      firstName: null,
      lastName: null,
    } as never);

    const result = await getCurrentUser();

    expect(result?.name).toBe("noname@example.com");
  });

  it("derives initials from just the first letter of firstName when lastName is missing", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_firstonly" } as never);
    mockedFindUnique.mockResolvedValueOnce({
      tenantId: TENANT_UUID,
      role: "TENANT",
      email: "demo@example.com",
      firstName: "Demo",
      lastName: null,
    } as never);

    const result = await getCurrentUser();

    expect(result?.initials).toBe("D");
  });

  it("derives initials from the first two characters of the email when no name is set at all", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_noname2" } as never);
    mockedFindUnique.mockResolvedValueOnce({
      tenantId: TENANT_UUID,
      role: "TENANT",
      email: "zed@example.com",
      firstName: null,
      lastName: null,
    } as never);

    const result = await getCurrentUser();

    expect(result?.initials).toBe("ZE");
  });

  it("throws on an unrecognized role value from the database, rather than mistyping the row", async () => {
    mockedAuth.mockResolvedValueOnce({ userId: "user_badrole" } as never);
    mockedFindUnique.mockResolvedValueOnce({
      tenantId: TENANT_UUID,
      role: "SUPERADMIN",
      email: "demo@example.com",
      firstName: null,
      lastName: null,
    } as never);

    await expect(getCurrentUser()).rejects.toThrow(/Unrecognized role value/);
  });
});
