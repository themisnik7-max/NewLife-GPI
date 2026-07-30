import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: vi.fn() },
    property: { findMany: vi.fn(), findFirst: vi.fn() },
    document: { findMany: vi.fn() },
    contact: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    deal: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  createContact,
  createDeal,
  deleteDeal,
  getContacts,
  getDeals,
  linkContactToClerkUser,
  moveDeal,
  updateContact,
  updateDeal,
} from "@/lib/data/pipeline";
import { prisma } from "@/lib/prisma";

const mockedContactFindMany = vi.mocked(prisma.contact.findMany);
const mockedContactFindFirst = vi.mocked(prisma.contact.findFirst);
const mockedContactCreate = vi.mocked(prisma.contact.create);
const mockedContactUpdateMany = vi.mocked(prisma.contact.updateMany);
const mockedDealFindMany = vi.mocked(prisma.deal.findMany);
const mockedDealFindFirst = vi.mocked(prisma.deal.findFirst);
const mockedDealGroupBy = vi.mocked(prisma.deal.groupBy);
const mockedDealCreate = vi.mocked(prisma.deal.create);
const mockedDealUpdateMany = vi.mocked(prisma.deal.updateMany);
const mockedDealDeleteMany = vi.mocked(prisma.deal.deleteMany);
const mockedPropertyFindMany = vi.mocked(prisma.property.findMany);
const mockedDocumentFindMany = vi.mocked(prisma.document.findMany);
const mockedPropertyFindFirst = vi.mocked(prisma.property.findFirst);
const mockedAudit = vi.mocked(prisma.auditLog.create);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const CONTACT_1 = "22222222-2222-2222-2222-222222222222";
const DEAL_1 = "33333333-3333-3333-3333-333333333333";
const PROPERTY_1 = "44444444-4444-4444-4444-444444444444";
const ACTOR = { tenantId: TENANT_A, actorUserId: "user_admin" };

const CONTACT_ROW = {
  id: CONTACT_1,
  firstName: "Maria",
  lastName: "Papadopoulos",
  email: "maria@example.com",
  phone: null,
  nationality: null,
  source: "Referral",
  notes: null,
  clerkUserId: null,
  ownerUserId: "user_admin",
  createdAt: new Date("2026-07-01T00:00:00Z"),
};

const DEAL_ROW = {
  id: DEAL_1,
  title: "2-bed in Athens",
  stage: "ATHENS_VISIT",
  value: 250000,
  expectedCloseDate: new Date("2026-09-01T00:00:00Z"),
  wonAt: null,
  lostAt: null,
  lostReason: null,
  position: 1000,
  contactId: CONTACT_1,
  propertyId: null,
  ownerUserId: "user_admin",
  createdAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
  contact: { firstName: "Maria", lastName: "Papadopoulos", email: "maria@example.com", clerkUserId: null },
};

beforeEach(() => {
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (tx: unknown) => unknown) => cb(prisma)) as never);
  mockedContactFindMany.mockReset().mockResolvedValue([] as never);
  mockedContactFindFirst.mockReset();
  mockedContactCreate.mockReset().mockResolvedValue(CONTACT_ROW as never);
  mockedContactUpdateMany.mockReset().mockResolvedValue({ count: 1 } as never);
  mockedDealFindMany.mockReset().mockResolvedValue([] as never);
  mockedDealFindFirst.mockReset().mockResolvedValue(null as never);
  mockedDealGroupBy.mockReset().mockResolvedValue([] as never);
  mockedDealCreate.mockReset().mockResolvedValue(DEAL_ROW as never);
  mockedDealUpdateMany.mockReset().mockResolvedValue({ count: 1 } as never);
  mockedDealDeleteMany.mockReset().mockResolvedValue({ count: 1 } as never);
  mockedPropertyFindMany.mockReset().mockResolvedValue([] as never);
  mockedDocumentFindMany.mockReset().mockResolvedValue([] as never);
  mockedPropertyFindFirst.mockReset().mockResolvedValue({ id: PROPERTY_1 } as never);
  mockedAudit.mockReset().mockResolvedValue({} as never);
});

describe("getDeals", () => {
  it("scopes to the tenant", async () => {
    await getDeals(TENANT_A);

    const { where } = mockedDealFindMany.mock.calls[0][0] as { where: { tenantId: string } };
    expect(where.tenantId).toBe(TENANT_A);
  });

  it("converts Decimal money to a plain number at this boundary", async () => {
    mockedDealFindMany.mockResolvedValueOnce([DEAL_ROW] as never);

    const [deal] = await getDeals(TENANT_A);

    expect(deal.value).toBe(250000);
    expect(typeof deal.value).toBe("number");
  });

  it("keeps a null value null rather than coercing it to zero", async () => {
    // Zero would drag every forecast down with fictional certainty.
    mockedDealFindMany.mockResolvedValueOnce([{ ...DEAL_ROW, value: null }] as never);

    const [deal] = await getDeals(TENANT_A);

    expect(deal.value).toBeNull();
  });

  it("resolves property names in one tenant-scoped query", async () => {
    mockedDealFindMany.mockResolvedValueOnce([
      { ...DEAL_ROW, propertyId: PROPERTY_1 },
      { ...DEAL_ROW, id: "d2", propertyId: PROPERTY_1 },
    ] as never);
    mockedPropertyFindMany.mockResolvedValueOnce([{ id: PROPERTY_1, name: "Aegean Court" }] as never);

    const deals = await getDeals(TENANT_A);

    expect(mockedPropertyFindMany).toHaveBeenCalledTimes(1);
    // Tenant-scoped as well as id-scoped: a deal must not be able to resolve
    // the name of another tenant's property.
    const { where } = mockedPropertyFindMany.mock.calls[0][0] as {
      where: { tenantId: string; id: { in: string[] } };
    };
    expect(where.tenantId).toBe(TENANT_A);
    expect(where.id.in).toEqual([PROPERTY_1]);
    expect(deals[0].propertyName).toBe("Aegean Court");
  });

  it("skips the property lookup when no deal references one", async () => {
    mockedDealFindMany.mockResolvedValueOnce([DEAL_ROW] as never);

    await getDeals(TENANT_A);

    expect(mockedPropertyFindMany).not.toHaveBeenCalled();
  });

  it("attaches the document categories filed against each deal", async () => {
    mockedDealFindMany.mockResolvedValueOnce([DEAL_ROW] as never);
    mockedDocumentFindMany.mockResolvedValueOnce([
      { entityId: DEAL_1, category: "POWER_OF_ATTORNEY" },
      { entityId: DEAL_1, category: "IDENTITY" },
    ] as never);

    const [deal] = await getDeals(TENANT_A);

    expect(deal.documentCategories.sort()).toEqual(["IDENTITY", "POWER_OF_ATTORNEY"]);
  });

  it("asks only for categories, not whole documents", async () => {
    // The board asks "is a POA on file", never "which POA" — pulling
    // filenames and uploader names for every card would be work discarded.
    mockedDealFindMany.mockResolvedValueOnce([DEAL_ROW] as never);

    await getDeals(TENANT_A);

    const call = mockedDocumentFindMany.mock.calls[0][0] as {
      where: { tenantId: string; entityType: string };
      select: Record<string, boolean>;
      distinct: string[];
    };
    expect(call.where.tenantId).toBe(TENANT_A);
    expect(call.where.entityType).toBe("Deal");
    expect(Object.keys(call.select).sort()).toEqual(["category", "entityId"]);
    expect(call.distinct).toEqual(["entityId", "category"]);
  });

  it("gives a deal with no documents an empty list, not undefined", async () => {
    mockedDealFindMany.mockResolvedValueOnce([DEAL_ROW] as never);

    const [deal] = await getDeals(TENANT_A);

    expect(deal.documentCategories).toEqual([]);
  });

  it("skips the document lookup when there are no deals", async () => {
    await getDeals(TENANT_A);

    expect(mockedDocumentFindMany).not.toHaveBeenCalled();
  });

  it("throws on a stage the database should never have held", async () => {
    mockedDealFindMany.mockResolvedValueOnce([{ ...DEAL_ROW, stage: "NEGOTIATING" }] as never);

    await expect(getDeals(TENANT_A)).rejects.toThrow(/Unrecognized deal stage/);
  });
});

describe("getContacts", () => {
  it("counts open deals per contact in one grouped query, not one per row", async () => {
    mockedContactFindMany.mockResolvedValueOnce([CONTACT_ROW] as never);
    mockedDealGroupBy.mockResolvedValueOnce([{ contactId: CONTACT_1, _count: { _all: 3 } }] as never);

    const [contact] = await getContacts(TENANT_A);

    expect(mockedDealGroupBy).toHaveBeenCalledTimes(1);
    expect(contact.openDealCount).toBe(3);
  });

  it("excludes won and lost deals from the open count", async () => {
    await getContacts(TENANT_A);

    const { where } = mockedDealGroupBy.mock.calls[0][0] as {
      where: { stage: { notIn: string[] } };
    };
    expect(where.stage.notIn).toEqual(["BUYER", "LOST"]);
  });

  it("reports zero for a contact with no deals", async () => {
    mockedContactFindMany.mockResolvedValueOnce([CONTACT_ROW] as never);

    const [contact] = await getContacts(TENANT_A);

    expect(contact.openDealCount).toBe(0);
  });
});

describe("createContact", () => {
  it("requires only a first name — a lead often starts as a name and a phone number", async () => {
    await createContact(ACTOR, { firstName: "Maria" });

    expect(mockedContactCreate).toHaveBeenCalled();
  });

  it("rejects a blank first name", async () => {
    await expect(createContact(ACTOR, { firstName: "  " })).rejects.toThrow(/first name/);
    expect(mockedContactCreate).not.toHaveBeenCalled();
  });

  it("lower-cases the email so the later conversion match is not defeated by typing", async () => {
    await createContact(ACTOR, { firstName: "Maria", email: "  Maria@Example.COM " });

    const { data } = mockedContactCreate.mock.calls[0][0] as { data: { email: string } };
    expect(data.email).toBe("maria@example.com");
  });

  it("takes the tenant and owner from the actor, never from the input", async () => {
    await createContact(ACTOR, { firstName: "Maria" });

    const { data } = mockedContactCreate.mock.calls[0][0] as {
      data: { tenantId: string; ownerUserId: string };
    };
    expect(data.tenantId).toBe(TENANT_A);
    expect(data.ownerUserId).toBe("user_admin");
  });

  it("audits the creation", async () => {
    await createContact(ACTOR, { firstName: "Maria" });

    const { data } = mockedAudit.mock.calls[0][0] as { data: { action: string; entityType: string } };
    expect(data).toMatchObject({ action: "CREATE", entityType: "Contact" });
  });
});

describe("updateContact", () => {
  beforeEach(() => {
    mockedContactFindFirst.mockResolvedValue({
      firstName: "Maria",
      lastName: "Papadopoulos",
      email: "maria@example.com",
      phone: null,
      nationality: null,
      source: "Referral",
      notes: null,
    } as never);
  });

  it("refuses to touch another tenant's contact", async () => {
    mockedContactFindFirst.mockResolvedValueOnce(null as never);

    await expect(updateContact(ACTOR, CONTACT_1, { phone: "123" })).rejects.toThrow(
      /was not found for tenant/,
    );
    expect(mockedContactUpdateMany).not.toHaveBeenCalled();
  });

  it("leaves omitted fields at their stored values", async () => {
    await updateContact(ACTOR, CONTACT_1, { phone: "+30 210 000 0000" });

    const { data } = mockedContactUpdateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.firstName).toBe("Maria");
    expect(data.source).toBe("Referral");
    expect(data.phone).toBe("+30 210 000 0000");
  });
});

describe("createDeal", () => {
  const INPUT = { contactId: CONTACT_1, title: "2-bed in Athens" };

  beforeEach(() => {
    mockedContactFindFirst.mockResolvedValue({ id: CONTACT_1 } as never);
  });

  it("verifies the contact belongs to the tenant BEFORE writing", async () => {
    // Prisma bypasses RLS, so a crafted request naming another tenant's
    // contact would otherwise succeed.
    mockedContactFindFirst.mockResolvedValueOnce(null as never);

    await expect(createDeal(ACTOR, INPUT)).rejects.toThrow(/Contact .* was not found for tenant/);
    expect(mockedDealCreate).not.toHaveBeenCalled();
  });

  it("verifies a referenced property belongs to the tenant too", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce(null as never);

    await expect(createDeal(ACTOR, { ...INPUT, propertyId: PROPERTY_1 })).rejects.toThrow(
      /Property .* was not found for tenant/,
    );
    expect(mockedDealCreate).not.toHaveBeenCalled();
  });

  it("skips the property check when no property is named", async () => {
    await createDeal(ACTOR, INPUT);

    expect(mockedPropertyFindFirst).not.toHaveBeenCalled();
  });

  it("defaults a new deal to the first stage", async () => {
    await createDeal(ACTOR, INPUT);

    const { data } = mockedDealCreate.mock.calls[0][0] as { data: { stage: string } };
    expect(data.stage).toBe("LEAD");
  });

  it("places a new card below the last one in its column", async () => {
    mockedDealFindFirst.mockResolvedValueOnce({ position: 4000 } as never);

    await createDeal(ACTOR, INPUT);

    const { data } = mockedDealCreate.mock.calls[0][0] as { data: { position: number } };
    expect(data.position).toBe(5000);
  });

  it("rejects a blank title, a negative value and an unknown stage", async () => {
    await expect(createDeal(ACTOR, { ...INPUT, title: " " })).rejects.toThrow(/title/);
    await expect(createDeal(ACTOR, { ...INPUT, value: -1 })).rejects.toThrow(/positive/);
    await expect(
      createDeal(ACTOR, { ...INPUT, stage: "NEGOTIATING" as never }),
    ).rejects.toThrow(/Unrecognized deal stage/);
  });
});

describe("moveDeal", () => {
  beforeEach(() => {
    mockedDealFindFirst.mockResolvedValue({
      stage: "ATHENS_VISIT",
      position: 1000,
      wonAt: null,
      lostAt: null,
    } as never);
  });

  it("writes the new stage and position atomically, scoped by tenant", async () => {
    await moveDeal(ACTOR, DEAL_1, "POWER_OF_ATTORNEY", 1500);

    expect(mockedDealUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEAL_1, tenantId: TENANT_A },
        data: expect.objectContaining({ stage: "POWER_OF_ATTORNEY", position: 1500 }),
      }),
    );
  });

  it("stamps wonAt on entry to Won", async () => {
    await moveDeal(ACTOR, DEAL_1, "BUYER", 1000);

    const { data } = mockedDealUpdateMany.mock.calls[0][0] as {
      data: { wonAt: Date | null; lostAt: Date | null };
    };
    expect(data.wonAt).toBeInstanceOf(Date);
    expect(data.lostAt).toBeNull();
  });

  it("preserves the original win date when a Won card is merely reordered", async () => {
    const originalWin = new Date("2026-06-01T00:00:00Z");
    mockedDealFindFirst.mockResolvedValueOnce({
      stage: "BUYER",
      position: 1000,
      wonAt: originalWin,
      lostAt: null,
    } as never);

    await moveDeal(ACTOR, DEAL_1, "BUYER", 2000);

    const { data } = mockedDealUpdateMany.mock.calls[0][0] as { data: { wonAt: Date } };
    expect(data.wonAt).toBe(originalWin);
  });

  it("clears the win date when a deal is dragged back onto the board", async () => {
    // A stale wonAt quietly corrupts every "how many did we close in Q3" query.
    mockedDealFindFirst.mockResolvedValueOnce({
      stage: "BUYER",
      position: 1000,
      wonAt: new Date("2026-06-01T00:00:00Z"),
      lostAt: null,
    } as never);

    await moveDeal(ACTOR, DEAL_1, "POWER_OF_ATTORNEY", 1000);

    const { data } = mockedDealUpdateMany.mock.calls[0][0] as { data: { wonAt: Date | null } };
    expect(data.wonAt).toBeNull();
  });

  it("audits the stage transition, which is what makes stage duration answerable", async () => {
    await moveDeal(ACTOR, DEAL_1, "POWER_OF_ATTORNEY", 1500);

    const audited = mockedAudit.mock.calls.map(
      (call) => (call[0] as { data: { field: string; oldValue: string; newValue: string } }).data,
    );
    expect(audited).toContainEqual(
      expect.objectContaining({ field: "stage", oldValue: "ATHENS_VISIT", newValue: "POWER_OF_ATTORNEY" }),
    );
  });

  it("writes no audit row for a pure reorder within the same stage", async () => {
    await moveDeal(ACTOR, DEAL_1, "ATHENS_VISIT", 1500);

    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("rejects an unknown stage, a non-finite position and another tenant's deal", async () => {
    await expect(moveDeal(ACTOR, DEAL_1, "NEGOTIATING" as never, 1)).rejects.toThrow(/Unrecognized/);
    await expect(moveDeal(ACTOR, DEAL_1, "ATHENS_VISIT", Number.NaN)).rejects.toThrow(/finite/);

    mockedDealFindFirst.mockResolvedValueOnce(null as never);
    await expect(moveDeal(ACTOR, DEAL_1, "ATHENS_VISIT", 1)).rejects.toThrow(/was not found for tenant/);
  });
});

describe("updateDeal / deleteDeal", () => {
  beforeEach(() => {
    mockedDealFindFirst.mockResolvedValue({
      title: "2-bed in Athens",
      value: 250000,
      propertyId: null,
      expectedCloseDate: null,
      lostReason: null,
    } as never);
  });

  it("verifies a newly-named property belongs to the tenant", async () => {
    mockedPropertyFindFirst.mockResolvedValueOnce(null as never);

    await expect(updateDeal(ACTOR, DEAL_1, { propertyId: PROPERTY_1 })).rejects.toThrow(
      /Property .* was not found/,
    );
    expect(mockedDealUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a negative value", async () => {
    await expect(updateDeal(ACTOR, DEAL_1, { value: -5 })).rejects.toThrow(/positive/);
  });

  it("records the title in the audit trail when a deal is deleted", async () => {
    mockedDealFindFirst.mockResolvedValueOnce({ title: "2-bed in Athens", stage: "ATHENS_VISIT" } as never);

    await deleteDeal(ACTOR, DEAL_1);

    expect(mockedDealDeleteMany).toHaveBeenCalledWith({
      where: { id: DEAL_1, tenantId: TENANT_A },
    });
    const { data } = mockedAudit.mock.calls[0][0] as {
      data: { action: string; metadata: { title: string } };
    };
    expect(data.action).toBe("DELETE");
    expect(data.metadata.title).toBe("2-bed in Athens");
  });
});

describe("linkContactToClerkUser (the conversion moment)", () => {
  it("links when exactly one unlinked contact matches the email", async () => {
    mockedContactFindMany.mockResolvedValueOnce([{ id: CONTACT_1 }] as never);

    const linked = await linkContactToClerkUser(TENANT_A, "maria@example.com", "user_new");

    expect(linked).toBe(CONTACT_1);
    expect(mockedContactUpdateMany).toHaveBeenCalledWith({
      // clerkUserId: null in the where as well as the lookup — the link must
      // not be able to overwrite an existing one between read and write.
      where: { id: CONTACT_1, tenantId: TENANT_A, clerkUserId: null },
      data: { clerkUserId: "user_new" },
    });
  });

  it("normalises the incoming email before matching", async () => {
    await linkContactToClerkUser(TENANT_A, "  Maria@Example.COM ", "user_new");

    const { where } = mockedContactFindMany.mock.calls[0][0] as { where: { email: string } };
    expect(where.email).toBe("maria@example.com");
  });

  it("declines when two contacts share the email — a wrong link is worse than none", async () => {
    // Two family members sharing an address. Attaching one person's private
    // notes to the other's account is the failure this refuses to risk.
    mockedContactFindMany.mockResolvedValueOnce([{ id: CONTACT_1 }, { id: "other" }] as never);

    await expect(linkContactToClerkUser(TENANT_A, "shared@example.com", "user_new")).resolves.toBeNull();
    expect(mockedContactUpdateMany).not.toHaveBeenCalled();
  });

  it("declines when nothing matches, and for a blank email", async () => {
    await expect(linkContactToClerkUser(TENANT_A, "nobody@example.com", "u")).resolves.toBeNull();
    await expect(linkContactToClerkUser(TENANT_A, "   ", "u")).resolves.toBeNull();
  });

  it("only ever considers contacts that are not already linked", async () => {
    await linkContactToClerkUser(TENANT_A, "maria@example.com", "user_new");

    const { where } = mockedContactFindMany.mock.calls[0][0] as { where: { clerkUserId: null } };
    expect(where.clerkUserId).toBeNull();
  });

  it("attributes the audit row to the person signing up, not to a phantom admin", async () => {
    mockedContactFindMany.mockResolvedValueOnce([{ id: CONTACT_1 }] as never);

    await linkContactToClerkUser(TENANT_A, "maria@example.com", "user_new");

    const { data } = mockedAudit.mock.calls[0][0] as { data: { actorUserId: string; field: string } };
    expect(data.actorUserId).toBe("user_new");
    expect(data.field).toBe("clerkUserId");
  });
});
