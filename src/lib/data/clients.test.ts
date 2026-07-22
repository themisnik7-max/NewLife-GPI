import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

import { getTenantClients } from "@/lib/data/clients";
import { prisma } from "@/lib/prisma";

const mockedFindMany = vi.mocked(prisma.user.findMany);

const TENANT_A = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  mockedFindMany.mockReset();
});

describe("getTenantClients", () => {
  it("queries only TENANT-role users in the given tenant, ordered by most recently created", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    await getTenantClients(TENANT_A);

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A, role: "TENANT" },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("combines firstName/lastName into a display name and formats the join date", async () => {
    mockedFindMany.mockResolvedValueOnce([
      {
        id: "user_1",
        firstName: "Maria",
        lastName: "Papadopoulos",
        email: "maria@example.com",
        createdAt: new Date("2026-03-14T00:00:00.000Z"),
        propertyOwnerships: [],
      },
    ] as never);

    const result = await getTenantClients(TENANT_A);

    expect(result).toEqual([
      {
        id: "user_1",
        name: "Maria Papadopoulos",
        email: "maria@example.com",
        property: "No property assigned",
        status: "Active",
        joinedDate: "14 Mar 2026",
      },
    ]);
  });

  it("falls back to the email address when firstName/lastName are both null", async () => {
    mockedFindMany.mockResolvedValueOnce([
      {
        id: "user_2",
        firstName: null,
        lastName: null,
        email: "noname@example.com",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        propertyOwnerships: [],
      },
    ] as never);

    const result = await getTenantClients(TENANT_A);

    expect(result[0].name).toBe("noname@example.com");
  });

  it("derives the property label from the user's most recent ownership row", async () => {
    mockedFindMany.mockResolvedValueOnce([
      {
        id: "user_3",
        firstName: "Demo",
        lastName: "Client",
        email: "demo@example.com",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        propertyOwnerships: [{ property: { name: "Villa Elytra", area: "Chania" } }],
      },
    ] as never);

    const result = await getTenantClients(TENANT_A);

    expect(result[0].property).toBe("Villa Elytra — Chania");
  });
});
