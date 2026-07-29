import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    savedView: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { deleteSavedView, getSavedViews, saveView } from "@/lib/data/savedViews";
import { EMPTY_VIEW } from "@/lib/views";
import { prisma } from "@/lib/prisma";

const mockedFindMany = vi.mocked(prisma.savedView.findMany);
const mockedUpsert = vi.mocked(prisma.savedView.upsert);
const mockedDeleteMany = vi.mocked(prisma.savedView.deleteMany);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const USER = "user_admin";

const CONFIG = {
  ...EMPTY_VIEW,
  search: "athens",
  sortKey: "name",
  sortDirection: "desc" as const,
};

beforeEach(() => {
  mockedFindMany.mockReset().mockResolvedValue([] as never);
  mockedUpsert.mockReset().mockResolvedValue({
    id: "v1",
    name: "Athens units",
    scope: "properties",
    config: CONFIG,
  } as never);
  mockedDeleteMany.mockReset().mockResolvedValue({ count: 1 } as never);
});

describe("getSavedViews", () => {
  it("scopes by tenant AND owner — a view is personal working state", async () => {
    // The one table where even an admin has no business reading someone
    // else's rows, which is why there is no admin-wide reader here at all.
    await getSavedViews(TENANT_A, USER, "properties");

    const { where } = mockedFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where).toEqual({ tenantId: TENANT_A, userId: USER, scope: "properties" });
  });

  it("sanitises a stored config rather than trusting the Json column", async () => {
    mockedFindMany.mockResolvedValueOnce([
      {
        id: "v1",
        name: "Stale view",
        scope: "properties",
        config: { search: "x", filters: [{ columnKey: "gone", operator: "explode" }], sortDirection: "sideways" },
      },
    ] as never);

    const [view] = await getSavedViews(TENANT_A, USER, "properties");

    // A view saved against an older shape of the app must degrade, not throw.
    expect(view.config.search).toBe("x");
    expect(view.config.filters).toEqual([]);
    expect(view.config.sortDirection).toBe("asc");
  });
});

describe("saveView", () => {
  it("upserts on the owner/scope/name key so re-saving a name updates it", async () => {
    await saveView(TENANT_A, USER, "properties", "Athens units", CONFIG);

    const call = mockedUpsert.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).toEqual({
      userId_scope_name: { userId: USER, scope: "properties", name: "Athens units" },
    });
  });

  it("takes the tenant and owner from its arguments, not from the config", async () => {
    await saveView(TENANT_A, USER, "properties", "Athens units", CONFIG);

    const { create } = mockedUpsert.mock.calls[0][0] as {
      create: { tenantId: string; userId: string };
    };
    expect(create.tenantId).toBe(TENANT_A);
    expect(create.userId).toBe(USER);
  });

  it("sanitises the config on the way IN, not just on the way out", async () => {
    // The client sends this object and it lands in an untyped Json column;
    // without this an arbitrary payload would be stored verbatim and handed
    // back to every future reader.
    await saveView(TENANT_A, USER, "properties", "Junk", {
      ...CONFIG,
      filters: [{ columnKey: "ok", operator: "is", value: "1" }, { nonsense: true }],
    } as never);

    const { create } = mockedUpsert.mock.calls[0][0] as {
      create: { config: { filters: unknown[] } };
    };
    expect(create.config.filters).toEqual([{ columnKey: "ok", operator: "is", value: "1" }]);
  });

  it("trims the name and rejects a blank one", async () => {
    await saveView(TENANT_A, USER, "properties", "  Athens units  ", CONFIG);
    const call = mockedUpsert.mock.calls[0][0] as {
      where: { userId_scope_name: { name: string } };
    };
    expect(call.where.userId_scope_name.name).toBe("Athens units");

    await expect(saveView(TENANT_A, USER, "properties", "   ", CONFIG)).rejects.toThrow(/needs a name/);
  });

  it("rejects a blank scope", async () => {
    await expect(saveView(TENANT_A, USER, "  ", "X", CONFIG)).rejects.toThrow(/needs a scope/);
  });
});

describe("deleteSavedView", () => {
  it("requires the view to belong to this tenant AND this user", async () => {
    await deleteSavedView(TENANT_A, USER, "v1");

    expect(mockedDeleteMany).toHaveBeenCalledWith({
      where: { id: "v1", tenantId: TENANT_A, userId: USER },
    });
  });

  it("throws rather than silently succeeding when nothing matched", async () => {
    // Deleting someone else's view should be a loud failure, not a quiet
    // no-op that looks like it worked.
    mockedDeleteMany.mockResolvedValueOnce({ count: 0 } as never);

    await expect(deleteSavedView(TENANT_A, USER, "v1")).rejects.toThrow(/was not found/);
  });
});
