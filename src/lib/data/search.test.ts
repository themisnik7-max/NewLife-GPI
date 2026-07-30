import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn() },
    property: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    activity: { findMany: vi.fn() },
  },
}));

import { searchTenant } from "@/lib/data/search";
import { prisma } from "@/lib/prisma";

const mockedUser = vi.mocked(prisma.user.findMany);
const mockedProperty = vi.mocked(prisma.property.findMany);
const mockedDocument = vi.mocked(prisma.document.findMany);
const mockedActivity = vi.mocked(prisma.activity.findMany);

const TENANT_A = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  mockedUser.mockReset().mockResolvedValue([] as never);
  mockedProperty.mockReset().mockResolvedValue([] as never);
  mockedDocument.mockReset().mockResolvedValue([] as never);
  mockedActivity.mockReset().mockResolvedValue([] as never);
});

describe("searchTenant", () => {
  it("scopes EVERY query to the tenant — this is the whole boundary", async () => {
    // Search is the widest read path in the app; Prisma bypasses RLS, so a
    // missing tenantId here leaks across organizations.
    await searchTenant(TENANT_A, "maria");

    for (const mocked of [mockedUser, mockedProperty, mockedDocument, mockedActivity]) {
      const { where } = mocked.mock.calls[0][0] as { where: { tenantId: string } };
      expect(where.tenantId).toBe(TENANT_A);
    }
  });

  it("returns nothing, and queries nothing, for a term under two characters", async () => {
    await expect(searchTenant(TENANT_A, "m")).resolves.toEqual([]);
    await expect(searchTenant(TENANT_A, "   ")).resolves.toEqual([]);

    expect(mockedUser).not.toHaveBeenCalled();
    expect(mockedProperty).not.toHaveBeenCalled();
  });

  it("matches case-insensitively", async () => {
    await searchTenant(TENANT_A, "MARIA");

    const { where } = mockedProperty.mock.calls[0][0] as {
      where: { OR: Array<{ name?: { contains: string; mode: string } }> };
    };
    expect(where.OR[0].name).toEqual({ contains: "MARIA", mode: "insensitive" });
  });

  it("searches only clients, never admins", async () => {
    // An admin searching their own name expects to find their clients.
    await searchTenant(TENANT_A, "themis");

    const { where } = mockedUser.mock.calls[0][0] as { where: { role: string } };
    expect(where.role).toBe("TENANT");
  });

  it("finds a client by name, email, passport or phone", async () => {
    await searchTenant(TENANT_A, "AB123");

    const { where } = mockedUser.mock.calls[0][0] as { where: { OR: Array<Record<string, unknown>> } };
    const fields = where.OR.flatMap((clause) => Object.keys(clause));
    expect(fields).toEqual(
      expect.arrayContaining(["firstName", "lastName", "email", "passportNumber", "phone"]),
    );
  });

  it("shapes a client result with a link to their record", async () => {
    mockedUser.mockResolvedValueOnce([
      { id: "user_1", firstName: "Maria", lastName: "Papadopoulos", email: "maria@example.com" },
    ] as never);

    const [result] = await searchTenant(TENANT_A, "maria");

    expect(result).toEqual({
      kind: "client",
      id: "user_1",
      title: "Maria Papadopoulos",
      subtitle: "maria@example.com",
      href: "/dashboard/clients/user_1",
    });
  });

  it("falls back to the email when a client has no name on file", async () => {
    mockedUser.mockResolvedValueOnce([
      { id: "user_1", firstName: null, lastName: null, email: "nameless@example.com" },
    ] as never);

    const [result] = await searchTenant(TENANT_A, "nameless");

    expect(result.title).toBe("nameless@example.com");
  });

  it("links a document to the record it is filed against, not to itself", async () => {
    // Neither documents nor activities have pages of their own; landing on
    // the client that owns "lease.pdf" is what the searcher actually wants.
    mockedDocument.mockResolvedValueOnce([
      {
        id: "doc-1",
        filename: "lease.pdf",
        category: "LEASE_AGREEMENT",
        entityType: "User",
        entityId: "user_9",
      },
    ] as never);

    const [result] = await searchTenant(TENANT_A, "lease");

    expect(result).toMatchObject({
      kind: "document",
      title: "lease.pdf",
      subtitle: "On a client",
      href: "/dashboard/clients/user_9",
    });
  });

  it("links an activity to its property", async () => {
    mockedActivity.mockResolvedValueOnce([
      { id: "a-1", subject: "Called the notary", type: "CALL", entityType: "Property", entityId: "prop-3" },
    ] as never);

    const [result] = await searchTenant(TENANT_A, "notary");

    expect(result).toMatchObject({
      kind: "activity",
      title: "Called the notary",
      subtitle: "Call · On a property",
      href: "/dashboard/projects/prop-3",
    });
  });

  it("never produces a dead link for an unmapped record type", async () => {
    mockedDocument.mockResolvedValueOnce([
      { id: "d", filename: "x.pdf", category: "OTHER", entityType: "Mystery", entityId: "z" },
    ] as never);

    const [result] = await searchTenant(TENANT_A, "x.pdf");

    expect(result.href).toBe("/dashboard");
  });

  it("caps each kind so the palette stays scannable", async () => {
    for (const mocked of [mockedUser, mockedProperty, mockedDocument, mockedActivity]) {
      const { take } = mocked.mock.calls[0]?.[0] ?? { take: undefined };
      expect(take).toBeUndefined();
    }

    await searchTenant(TENANT_A, "a1");

    for (const mocked of [mockedUser, mockedProperty, mockedDocument, mockedActivity]) {
      const { take } = mocked.mock.calls[0][0] as { take: number };
      expect(take).toBe(6);
    }
  });

  it("returns results grouped by kind in a stable order", async () => {
    mockedUser.mockResolvedValueOnce([
      { id: "u", firstName: "A", lastName: "B", email: "a@b.c" },
    ] as never);
    mockedProperty.mockResolvedValueOnce([
      { id: "p", name: "Aegean Court", area: "Athens", address: "1 Main St" },
    ] as never);

    const results = await searchTenant(TENANT_A, "ae");
    const kinds = results.map((result) => result.kind);

    expect(kinds).toEqual(["client", "property"]);
  });
});
