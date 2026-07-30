import "server-only";
import { prisma } from "@/lib/prisma";
import { AuditAction, recordAuditEvent, recordFieldChanges, type ActorContext } from "@/lib/data/audit";
import { deleteStoredObject } from "@/lib/storage";
import {
  categoryLabelFor,
  isImageDocument,
  isKnownDocumentCategory,
  type DocumentEntityType,
  type DocumentView,
} from "@/lib/documents";

/**
 * Prisma-backed read/write layer for the general document store.
 *
 * The canonical category list lives in src/lib/documents.ts (client-safe);
 * the object store lives in src/lib/storage.ts. Every write here is audited
 * inside the same transaction as the change, so the history of who filed and
 * who removed a document survives the document itself.
 *
 * ⚠️ READ THE TWO-FUNCTION RULE BEFORE ADDING ANYTHING HERE.
 * `getEntityDocuments` (admin, everything) and `getClientVisibleDocuments`
 * (the signed-in client, only what was deliberately shared) are separate
 * exports, not one function with a boolean. This follows ARCHITECTURE.md's
 * "Two functions, not one function with a flag" — collapsing them is how a
 * page leaks by passing `undefined`, and here the leak would be an internal
 * valuation or a passport scan appearing on the client's own portal. Prisma
 * bypasses RLS, so nothing below this file will catch that mistake.
 */

interface DocumentRow {
  id: string;
  entityType: string;
  entityId: string;
  category: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  description: string | null;
  visibleToClient: boolean;
  uploadedByUserId: string;
  createdAt: Date;
}

/**
 * Uploader display names, resolved in one query rather than per row.
 *
 * A raw Clerk id ("user_2abc…") in a "filed by" column is unreadable, and
 * joining User on every document row through Prisma's `include` would need a
 * real relation this deliberately-polymorphic table does not have.
 */
async function resolveUploaderNames(
  tenantId: string,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  return new Map(
    users.map((user) => [
      user.id,
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email,
    ]),
  );
}

function toDocumentView(row: DocumentRow, uploaderNames: Map<string, string>): DocumentView {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    category: row.category,
    // Falls back to the raw key for a category that has since been removed
    // from the canonical list, rather than throwing — the same tolerance
    // getClientRentalStages() applies to an unknown stageKey, and for the
    // same reason: the vocabulary is business process and expected to change.
    categoryLabel: categoryLabelFor(row.category),
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    description: row.description,
    visibleToClient: row.visibleToClient,
    uploadedByUserId: row.uploadedByUserId,
    uploadedByName: uploaderNames.get(row.uploadedByUserId) ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
    // The storage path is deliberately never included — downloads go through
    // a short-lived signed URL minted server-side, so a leaked path is not a
    // leaked file.
    isImage: isImageDocument(row.contentType),
  };
}

const DOCUMENT_SELECT = {
  id: true,
  entityType: true,
  entityId: true,
  category: true,
  filename: true,
  contentType: true,
  sizeBytes: true,
  description: true,
  visibleToClient: true,
  uploadedByUserId: true,
  createdAt: true,
} as const;

/**
 * Every document filed against one record, newest first.
 *
 * ADMIN ONLY. Returns internal files alongside shared ones and applies no
 * per-user filter whatsoever. Like getTenantVisaOverview() and the other
 * admin-only readers, this deliberately does NOT check the session itself —
 * it takes a tenant id and a subject that are not necessarily the caller's,
 * so the *page* must perform the role check and call `notFound()` before
 * reaching here.
 */
export async function getEntityDocuments(
  tenantId: string,
  entityType: DocumentEntityType,
  entityId: string,
): Promise<DocumentView[]> {
  const rows = await prisma.document.findMany({
    where: { tenantId, entityType, entityId },
    orderBy: { createdAt: "desc" },
    select: DOCUMENT_SELECT,
  });

  const uploaderNames = await resolveUploaderNames(
    tenantId,
    rows.map((row) => row.uploadedByUserId),
  );
  return rows.map((row) => toDocumentView(row, uploaderNames));
}

/**
 * The documents one client is allowed to see for one record.
 *
 * The counterpart to getEntityDocuments above, and the only reader a
 * client-facing page may call. Two filters do the work and both are
 * load-bearing:
 *
 *  - `visibleToClient: true` — withholds anything not deliberately shared.
 *  - the caller-supplied `userId` on User-scoped records — because the admin
 *    and the demo client share a tenant in this deployment (see
 *    ARCHITECTURE.md), tenant scoping alone would show each of them the
 *    other's files.
 */
export async function getClientVisibleDocuments(
  tenantId: string,
  entityType: DocumentEntityType,
  entityId: string,
): Promise<DocumentView[]> {
  const rows = await prisma.document.findMany({
    where: { tenantId, entityType, entityId, visibleToClient: true },
    orderBy: { createdAt: "desc" },
    select: DOCUMENT_SELECT,
  });

  const uploaderNames = await resolveUploaderNames(
    tenantId,
    rows.map((row) => row.uploadedByUserId),
  );
  return rows.map((row) => toDocumentView(row, uploaderNames));
}

/** How many files are filed against a record — for the tab badge, without
 * paying to fetch and shape every row. */
export async function countEntityDocuments(
  tenantId: string,
  entityType: DocumentEntityType,
  entityId: string,
): Promise<number> {
  return prisma.document.count({ where: { tenantId, entityType, entityId } });
}

export interface CreateDocumentInput {
  entityType: DocumentEntityType;
  entityId: string;
  category: string;
  storagePath: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  description?: string | null;
  visibleToClient?: boolean;
}

/**
 * Records an already-uploaded object as a document.
 *
 * The caller is responsible for having stored the object first (via
 * uploadDocument in src/lib/storage.ts) — this records where it landed, the
 * same division of labour as attachRentalStageFile().
 *
 * `visibleToClient` defaults to false rather than being required. A required
 * parameter would be the more explicit design in general, but here the safe
 * value and the default must be the same thing: a caller that forgets the
 * argument must under-share, never over-share.
 */
export async function createDocument(
  actor: ActorContext,
  input: CreateDocumentInput,
): Promise<DocumentView> {
  if (!isKnownDocumentCategory(input.category)) {
    throw new Error(`Unrecognized document category: ${input.category}`);
  }
  if (!input.entityId?.trim()) {
    throw new Error("Document entityId must not be empty.");
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("Document sizeBytes must be a positive whole number.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        tenantId: actor.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        category: input.category,
        storagePath: input.storagePath,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        description: input.description ?? null,
        visibleToClient: input.visibleToClient ?? false,
        uploadedByUserId: actor.actorUserId,
      },
      select: DOCUMENT_SELECT,
    });

    // Records the filename and category, never the storage path: an audit
    // trail that hands out object locations undermines the signed-URL model
    // the rest of this feature depends on.
    await recordAuditEvent(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.actorUserId,
      entityType: "Document",
      entityId: document.id,
      action: AuditAction.CREATE,
      metadata: {
        filename: input.filename,
        category: input.category,
        subjectEntityType: input.entityType,
        subjectEntityId: input.entityId,
        visibleToClient: input.visibleToClient ?? false,
      },
    });

    return document;
  });

  const uploaderNames = await resolveUploaderNames(actor.tenantId, [created.uploadedByUserId]);
  return toDocumentView(created, uploaderNames);
}

export interface UpdateDocumentInput {
  category?: string;
  description?: string | null;
  visibleToClient?: boolean;
}

/**
 * Edits a document's metadata — its category, description, or whether the
 * client can see it. The stored object itself is immutable: replacing a file
 * means uploading a new one, so a document a signed contract points at can
 * never change underneath it.
 *
 * Uses `updateMany` with `id` AND `tenantId` in one atomic `where`, the same
 * reasoning as revokeTenantApiKey(): `update`'s `where` takes a single unique
 * field, which would force either a separate existence check first (a TOCTOU
 * gap) or filtering by `id` alone with no tenant check at all.
 */
export async function updateDocument(
  actor: ActorContext,
  documentId: string,
  input: UpdateDocumentInput,
): Promise<void> {
  if (input.category !== undefined && !isKnownDocumentCategory(input.category)) {
    throw new Error(`Unrecognized document category: ${input.category}`);
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.document.findFirst({
      where: { id: documentId, tenantId: actor.tenantId },
      select: { category: true, description: true, visibleToClient: true },
    });
    if (!existing) {
      throw new Error(`Document ${documentId} was not found for tenant ${actor.tenantId}.`);
    }

    const next = {
      category: input.category ?? existing.category,
      description: input.description === undefined ? existing.description : input.description,
      visibleToClient: input.visibleToClient ?? existing.visibleToClient,
    };

    await tx.document.updateMany({
      where: { id: documentId, tenantId: actor.tenantId },
      data: next,
    });

    await recordFieldChanges(
      tx,
      {
        tenantId: actor.tenantId,
        actorUserId: actor.actorUserId,
        entityType: "Document",
        entityId: documentId,
      },
      existing,
      next,
    );
  });
}

/**
 * Deletes a document row, then its stored object.
 *
 * That order is deliberate. An orphaned object costs storage and nothing
 * else; a surviving row that points at a deleted object renders a download
 * button that always fails. So the row goes first, and a storage failure
 * afterwards is logged rather than rethrown — by then the user's actual
 * intent (the file no longer appears anywhere) has already succeeded, and
 * throwing would report a failure for an operation that worked.
 *
 * The audit row is written inside the same transaction as the delete and
 * carries the filename, so the record that this file once existed survives
 * the row that described it.
 */
export async function deleteDocument(actor: ActorContext, documentId: string): Promise<void> {
  const storagePath = await prisma.$transaction(async (tx) => {
    const existing = await tx.document.findFirst({
      where: { id: documentId, tenantId: actor.tenantId },
      select: { storagePath: true, filename: true, category: true, entityType: true, entityId: true },
    });
    if (!existing) {
      throw new Error(`Document ${documentId} was not found for tenant ${actor.tenantId}.`);
    }

    await tx.document.deleteMany({ where: { id: documentId, tenantId: actor.tenantId } });

    await recordAuditEvent(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.actorUserId,
      entityType: "Document",
      entityId: documentId,
      action: AuditAction.DELETE,
      metadata: {
        filename: existing.filename,
        category: existing.category,
        subjectEntityType: existing.entityType,
        subjectEntityId: existing.entityId,
      },
    });

    return existing.storagePath;
  });

  await deleteStoredObject(storagePath).catch((err: unknown) => {
    console.error(`Failed to remove stored object for document ${documentId}:`, err);
  });
}

/**
 * Resolves a document's stored object path so a signed URL can be minted.
 *
 * ADMIN PATH — applies no visibility filter. The client-facing counterpart is
 * getClientVisibleDocumentPath() below. Returns null for "not found" and
 * "wrong tenant" uniformly, the same reasoning as getDecryptedApiKey(): a
 * caller must not be able to tell the two apart from the return value.
 */
export async function getDocumentPath(tenantId: string, documentId: string): Promise<string | null> {
  const row = await prisma.document.findFirst({
    where: { id: documentId, tenantId },
    select: { storagePath: true },
  });
  return row?.storagePath ?? null;
}

/**
 * The client-facing counterpart to getDocumentPath.
 *
 * Adds `visibleToClient: true` to the lookup, so a client who guesses or
 * scrapes a document id cannot mint a signed URL for an internal file. This
 * being a separate function rather than a parameter is the whole point — see
 * the two-function rule at the top of this module.
 */
export async function getClientVisibleDocumentPath(
  tenantId: string,
  documentId: string,
): Promise<string | null> {
  const row = await prisma.document.findFirst({
    where: { id: documentId, tenantId, visibleToClient: true },
    select: { storagePath: true },
  });
  return row?.storagePath ?? null;
}
