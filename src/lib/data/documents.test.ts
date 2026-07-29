import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: vi.fn() },
    user: { findMany: vi.fn() },
    document: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/storage", () => ({
  deleteStoredObject: vi.fn(),
}));

import {
  countEntityDocuments,
  createDocument,
  deleteDocument,
  getClientVisibleDocumentPath,
  getClientVisibleDocuments,
  getDocumentPath,
  getEntityDocuments,
  updateDocument,
} from "@/lib/data/documents";
import { prisma } from "@/lib/prisma";
import { deleteStoredObject } from "@/lib/storage";

const mockedFindMany = vi.mocked(prisma.document.findMany);
const mockedFindFirst = vi.mocked(prisma.document.findFirst);
const mockedCount = vi.mocked(prisma.document.count);
const mockedCreate = vi.mocked(prisma.document.create);
const mockedUpdateMany = vi.mocked(prisma.document.updateMany);
const mockedDeleteMany = vi.mocked(prisma.document.deleteMany);
const mockedUserFindMany = vi.mocked(prisma.user.findMany);
const mockedAudit = vi.mocked(prisma.auditLog.create);
const mockedDeleteObject = vi.mocked(deleteStoredObject);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const PROPERTY_1 = "22222222-2222-2222-2222-222222222222";
const DOC_1 = "33333333-3333-3333-3333-333333333333";
const ACTOR = { tenantId: TENANT_A, actorUserId: "user_admin" };

const ROW = {
  id: DOC_1,
  entityType: "Property",
  entityId: PROPERTY_1,
  category: "LEASE_AGREEMENT",
  filename: "lease.pdf",
  contentType: "application/pdf",
  sizeBytes: 2048,
  description: null,
  visibleToClient: false,
  uploadedByUserId: "user_admin",
  createdAt: new Date("2026-07-01T10:00:00Z"),
};

beforeEach(() => {
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (tx: unknown) => unknown) => cb(prisma)) as never);
  mockedFindMany.mockReset().mockResolvedValue([] as never);
  mockedFindFirst.mockReset();
  mockedCount.mockReset();
  mockedCreate.mockReset().mockResolvedValue(ROW as never);
  mockedUpdateMany.mockReset().mockResolvedValue({ count: 1 } as never);
  mockedDeleteMany.mockReset().mockResolvedValue({ count: 1 } as never);
  mockedUserFindMany.mockReset().mockResolvedValue([] as never);
  mockedAudit.mockReset().mockResolvedValue({} as never);
  mockedDeleteObject.mockReset().mockResolvedValue(undefined);
});

describe("getEntityDocuments (admin reader)", () => {
  it("filters by tenant, entity type and entity id together", async () => {
    await getEntityDocuments(TENANT_A, "Property", PROPERTY_1);

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A, entityType: "Property", entityId: PROPERTY_1 },
      }),
    );
  });

  it("does NOT filter by visibleToClient — an admin sees internal files too", async () => {
    await getEntityDocuments(TENANT_A, "Property", PROPERTY_1);

    const { where } = mockedFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where).not.toHaveProperty("visibleToClient");
  });

  it("never returns the storage path — downloads go through signed URLs", async () => {
    mockedFindMany.mockResolvedValueOnce([ROW] as never);

    const [doc] = await getEntityDocuments(TENANT_A, "Property", PROPERTY_1);

    expect(doc).not.toHaveProperty("storagePath");
  });

  it("resolves uploader display names in one query rather than per row", async () => {
    mockedFindMany.mockResolvedValueOnce([
      ROW,
      { ...ROW, id: "doc-2", uploadedByUserId: "user_admin" },
      { ...ROW, id: "doc-3", uploadedByUserId: "user_other" },
    ] as never);
    mockedUserFindMany.mockResolvedValueOnce([
      { id: "user_admin", firstName: "Themis", lastName: "Nikolaou", email: "t@example.com" },
      { id: "user_other", firstName: null, lastName: null, email: "other@example.com" },
    ] as never);

    const docs = await getEntityDocuments(TENANT_A, "Property", PROPERTY_1);

    expect(mockedUserFindMany).toHaveBeenCalledTimes(1);
    // Deduplicated: two rows share an uploader, so only two ids are looked up.
    const { where } = mockedUserFindMany.mock.calls[0][0] as { where: { id: { in: string[] } } };
    expect(where.id.in).toEqual(["user_admin", "user_other"]);
    expect(docs[0].uploadedByName).toBe("Themis Nikolaou");
    // Falls back to email when the Clerk profile carries no name.
    expect(docs[2].uploadedByName).toBe("other@example.com");
  });

  it("falls back to 'Unknown' for an uploader no longer in the tenant", async () => {
    mockedFindMany.mockResolvedValueOnce([ROW] as never);
    mockedUserFindMany.mockResolvedValueOnce([] as never);

    const [doc] = await getEntityDocuments(TENANT_A, "Property", PROPERTY_1);

    expect(doc.uploadedByName).toBe("Unknown");
  });

  it("labels a category that has since left the canonical list by its raw key", async () => {
    mockedFindMany.mockResolvedValueOnce([{ ...ROW, category: "RETIRED" }] as never);

    const [doc] = await getEntityDocuments(TENANT_A, "Property", PROPERTY_1);

    expect(doc.categoryLabel).toBe("RETIRED");
  });

  it("skips the name lookup entirely when there are no documents", async () => {
    await getEntityDocuments(TENANT_A, "Property", PROPERTY_1);

    expect(mockedUserFindMany).not.toHaveBeenCalled();
  });
});

describe("getClientVisibleDocuments (client reader)", () => {
  it("adds visibleToClient — this filter is the whole reason it is a separate function", async () => {
    await getClientVisibleDocuments(TENANT_A, "Property", PROPERTY_1);

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT_A,
          entityType: "Property",
          entityId: PROPERTY_1,
          visibleToClient: true,
        },
      }),
    );
  });
});

describe("countEntityDocuments", () => {
  it("counts rather than fetching and measuring the array", async () => {
    mockedCount.mockResolvedValueOnce(4 as never);

    await expect(countEntityDocuments(TENANT_A, "Property", PROPERTY_1)).resolves.toBe(4);
    expect(mockedFindMany).not.toHaveBeenCalled();
  });
});

describe("createDocument", () => {
  const INPUT = {
    entityType: "Property" as const,
    entityId: PROPERTY_1,
    category: "LEASE_AGREEMENT",
    storagePath: "documents/tenant/Property/prop/123.pdf",
    filename: "lease.pdf",
    contentType: "application/pdf",
    sizeBytes: 2048,
  };

  it("stores the row with the tenant and uploader resolved from the actor, not the input", async () => {
    await createDocument(ACTOR, INPUT);

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_A,
          uploadedByUserId: "user_admin",
          storagePath: INPUT.storagePath,
        }),
      }),
    );
  });

  it("defaults visibleToClient to false so a forgotten argument under-shares", async () => {
    await createDocument(ACTOR, INPUT);

    const { data } = mockedCreate.mock.calls[0][0] as { data: { visibleToClient: boolean } };
    expect(data.visibleToClient).toBe(false);
  });

  it("honours an explicit share", async () => {
    await createDocument(ACTOR, { ...INPUT, visibleToClient: true });

    const { data } = mockedCreate.mock.calls[0][0] as { data: { visibleToClient: boolean } };
    expect(data.visibleToClient).toBe(true);
  });

  it("rejects a category outside the canonical list", async () => {
    await expect(createDocument(ACTOR, { ...INPUT, category: "NONSENSE" })).rejects.toThrow(
      /Unrecognized document category/,
    );
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty entityId and a non-positive size", async () => {
    await expect(createDocument(ACTOR, { ...INPUT, entityId: "  " })).rejects.toThrow(/entityId/);
    await expect(createDocument(ACTOR, { ...INPUT, sizeBytes: 0 })).rejects.toThrow(/sizeBytes/);
  });

  it("writes an audit row that records the filename but never the storage path", async () => {
    await createDocument(ACTOR, INPUT);

    expect(mockedAudit).toHaveBeenCalledTimes(1);
    const { data } = mockedAudit.mock.calls[0][0] as {
      data: { action: string; entityType: string; metadata: Record<string, unknown> };
    };
    expect(data.action).toBe("CREATE");
    expect(data.entityType).toBe("Document");
    expect(data.metadata.filename).toBe("lease.pdf");
    // An audit trail that hands out object locations undermines the
    // signed-URL model the whole feature depends on.
    expect(JSON.stringify(data.metadata)).not.toContain("documents/tenant");
  });
});

describe("updateDocument", () => {
  beforeEach(() => {
    mockedFindFirst.mockResolvedValue({
      category: "LEASE_AGREEMENT",
      description: null,
      visibleToClient: false,
    } as never);
  });

  it("scopes the write by id AND tenant in one atomic where", async () => {
    await updateDocument(ACTOR, DOC_1, { visibleToClient: true });

    expect(mockedUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DOC_1, tenantId: TENANT_A } }),
    );
  });

  it("throws rather than silently no-opping when the document is another tenant's", async () => {
    mockedFindFirst.mockResolvedValueOnce(null as never);

    await expect(updateDocument(ACTOR, DOC_1, { visibleToClient: true })).rejects.toThrow(
      /was not found for tenant/,
    );
    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });

  it("leaves untouched fields at their stored value instead of nulling them", async () => {
    mockedFindFirst.mockResolvedValueOnce({
      category: "SALE_CONTRACT",
      description: "Signed original",
      visibleToClient: true,
    } as never);

    await updateDocument(ACTOR, DOC_1, { category: "LEASE_AGREEMENT" });

    const { data } = mockedUpdateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toEqual({
      category: "LEASE_AGREEMENT",
      description: "Signed original",
      visibleToClient: true,
    });
  });

  it("distinguishes an explicit null description from an omitted one", async () => {
    mockedFindFirst.mockResolvedValueOnce({
      category: "SALE_CONTRACT",
      description: "Signed original",
      visibleToClient: false,
    } as never);

    await updateDocument(ACTOR, DOC_1, { description: null });

    const { data } = mockedUpdateMany.mock.calls[0][0] as { data: { description: string | null } };
    expect(data.description).toBeNull();
  });

  it("audits a visibility change, which is the one edit with a security consequence", async () => {
    await updateDocument(ACTOR, DOC_1, { visibleToClient: true });

    const audited = mockedAudit.mock.calls.map(
      (call) => (call[0] as { data: { field: string; oldValue: string; newValue: string } }).data,
    );
    expect(audited).toContainEqual(
      expect.objectContaining({ field: "visibleToClient", oldValue: "false", newValue: "true" }),
    );
  });

  it("writes no audit row when nothing actually changed", async () => {
    await updateDocument(ACTOR, DOC_1, { visibleToClient: false });

    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it("rejects an unknown category before touching the database", async () => {
    await expect(updateDocument(ACTOR, DOC_1, { category: "NONSENSE" })).rejects.toThrow(
      /Unrecognized document category/,
    );
    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });
});

describe("deleteDocument", () => {
  beforeEach(() => {
    mockedFindFirst.mockResolvedValue({
      storagePath: "documents/t/Property/p/1.pdf",
      filename: "lease.pdf",
      category: "LEASE_AGREEMENT",
      entityType: "Property",
      entityId: PROPERTY_1,
    } as never);
  });

  it("removes the row, then the stored object — in that order", async () => {
    await deleteDocument(ACTOR, DOC_1);

    expect(mockedDeleteMany).toHaveBeenCalledWith({ where: { id: DOC_1, tenantId: TENANT_A } });
    expect(mockedDeleteObject).toHaveBeenCalledWith("documents/t/Property/p/1.pdf");
    expect(mockedDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockedDeleteObject.mock.invocationCallOrder[0],
    );
  });

  it("still succeeds when storage removal fails — the user's intent already worked", async () => {
    // An orphaned object costs storage; reporting failure for an operation
    // whose visible effect succeeded costs trust.
    mockedDeleteObject.mockRejectedValueOnce(new Error("bucket unreachable"));

    await expect(deleteDocument(ACTOR, DOC_1)).resolves.toBeUndefined();
  });

  it("refuses to delete another tenant's document", async () => {
    mockedFindFirst.mockResolvedValueOnce(null as never);

    await expect(deleteDocument(ACTOR, DOC_1)).rejects.toThrow(/was not found for tenant/);
    expect(mockedDeleteMany).not.toHaveBeenCalled();
    expect(mockedDeleteObject).not.toHaveBeenCalled();
  });

  it("records the filename in the audit trail so the file's existence outlives its row", async () => {
    await deleteDocument(ACTOR, DOC_1);

    const { data } = mockedAudit.mock.calls[0][0] as {
      data: { action: string; metadata: Record<string, unknown> };
    };
    expect(data.action).toBe("DELETE");
    expect(data.metadata.filename).toBe("lease.pdf");
  });
});

describe("path resolution", () => {
  it("getDocumentPath applies no visibility filter — it is the admin path", async () => {
    mockedFindFirst.mockResolvedValueOnce({ storagePath: "p" } as never);

    await getDocumentPath(TENANT_A, DOC_1);

    const { where } = mockedFindFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where).toEqual({ id: DOC_1, tenantId: TENANT_A });
  });

  it("getClientVisibleDocumentPath requires the document to be shared", async () => {
    mockedFindFirst.mockResolvedValueOnce(null as never);

    await getClientVisibleDocumentPath(TENANT_A, DOC_1);

    const { where } = mockedFindFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where).toEqual({ id: DOC_1, tenantId: TENANT_A, visibleToClient: true });
  });

  it("returns null uniformly for missing, wrong-tenant and unshared", async () => {
    mockedFindFirst.mockResolvedValue(null as never);

    // A caller must not be able to tell the three apart from the return value.
    await expect(getDocumentPath(TENANT_A, DOC_1)).resolves.toBeNull();
    await expect(getClientVisibleDocumentPath(TENANT_A, DOC_1)).resolves.toBeNull();
  });
});
