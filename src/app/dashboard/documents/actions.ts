"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { Role } from "@/lib/auth/role";
import {
  createDocument,
  deleteDocument,
  getClientVisibleDocumentPath,
  getDocumentPath,
  updateDocument,
} from "@/lib/data/documents";
import { createSignedDownloadUrl, isStorageConfigured, uploadDocument } from "@/lib/storage";
import { isKnownDocumentCategory, type DocumentEntityType } from "@/lib/documents";
import type { ActorContext } from "@/lib/data/audit";

/**
 * Server Actions for the Files panel.
 *
 * Every write here re-checks admin role server-side rather than trusting that
 * the controls were hidden from a non-admin, the same reasoning as
 * src/app/dashboard/clients/[userId]/actions.ts's own requireAdmin().
 *
 * `tenantId` and `actorUserId` always come from the signed-in user's resolved
 * session, never from a parameter — that is what stops a crafted request
 * naming an entity in another tenant from writing across the boundary, and
 * what makes the audit trail's attribution trustworthy, since Prisma bypasses
 * RLS entirely (see ARCHITECTURE.md).
 */

async function requireAdmin() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== Role.ADMIN) {
    throw new Error("Admin access required.");
  }
  return currentUser;
}

function actorFrom(currentUser: { tenantId: string; userId: string }): ActorContext {
  return { tenantId: currentUser.tenantId, actorUserId: currentUser.userId };
}

const VALID_ENTITY_TYPES: ReadonlySet<string> = new Set<DocumentEntityType>([
  "Property",
  "User",
  "PaymentLedger",
  "ConstructionMilestone",
  "Deal",
]);

function toEntityType(raw: string): DocumentEntityType {
  if (!VALID_ENTITY_TYPES.has(raw)) {
    throw new Error(`Unrecognized document entity type: ${raw}`);
  }
  return raw as DocumentEntityType;
}

/**
 * Refreshes every page that could be showing this file.
 *
 * Deliberately broad rather than surgical: a document filed against a
 * property appears on the property detail page, the client page of whoever
 * owns it, and the construction page — and getting this wrong shows an admin
 * a Files panel that does not contain the file they just uploaded, which
 * reads as a failed upload.
 */
function revalidateDocumentViews(entityType: DocumentEntityType, entityId: string): void {
  revalidatePath("/dashboard/documents");
  switch (entityType) {
    case "Property":
      revalidatePath(`/dashboard/projects/${entityId}`);
      revalidatePath(`/dashboard/property/${entityId}`);
      revalidatePath("/dashboard/property");
      revalidatePath("/dashboard/construction");
      break;
    case "User":
      revalidatePath(`/dashboard/clients/${entityId}`);
      revalidatePath("/dashboard/clients");
      break;
    case "PaymentLedger":
      revalidatePath("/dashboard/payments");
      break;
    case "ConstructionMilestone":
      revalidatePath("/dashboard/construction");
      break;
    case "Deal":
      // The board shows a "POA missing" flag derived from what is filed
      // against the deal, so uploading the POA has to invalidate it.
      revalidatePath("/dashboard/pipeline");
      break;
  }
}

/**
 * Uploads a file and records it, as one action.
 *
 * Takes FormData rather than a `File` argument because a File cannot cross
 * the Server Action boundary as a plain parameter — the browser has to send
 * it as multipart form data, which is what the panel's <form> submits.
 *
 * The object is stored first and the row written second. If the row write
 * fails the object is orphaned, which costs storage and nothing else; the
 * reverse order would produce a row pointing at a file that was never stored,
 * rendering a download button that always fails. Same tradeoff, and same
 * direction, as deleteDocument().
 */
export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const currentUser = await requireAdmin();

  if (!isStorageConfigured()) {
    throw new Error("File storage is not configured. See ENVIRONMENT_DEPLOY.md.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("No file was received.");
  }

  const entityType = toEntityType(String(formData.get("entityType") ?? ""));
  const entityId = String(formData.get("entityId") ?? "");
  const category = String(formData.get("category") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  // An unchecked checkbox sends nothing at all, which correctly reads as
  // false — the safe direction, per Document.visibleToClient's doc comment.
  const visibleToClient = formData.get("visibleToClient") === "on";

  if (!isKnownDocumentCategory(category)) {
    throw new Error(`Unrecognized document category: ${category}`);
  }

  const stored = await uploadDocument({
    tenantId: currentUser.tenantId,
    entityType,
    entityId,
    file,
  });

  await createDocument(actorFrom(currentUser), {
    entityType,
    entityId,
    category,
    storagePath: stored.path,
    filename: stored.filename,
    contentType: stored.contentType,
    sizeBytes: stored.sizeBytes,
    description: description || null,
    visibleToClient,
  });

  revalidateDocumentViews(entityType, entityId);
}

export async function updateDocumentAction(
  documentId: string,
  entityType: string,
  entityId: string,
  input: { category?: string; description?: string | null; visibleToClient?: boolean },
): Promise<void> {
  const currentUser = await requireAdmin();
  await updateDocument(actorFrom(currentUser), documentId, input);
  revalidateDocumentViews(toEntityType(entityType), entityId);
}

export async function deleteDocumentAction(
  documentId: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  const currentUser = await requireAdmin();
  await deleteDocument(actorFrom(currentUser), documentId);
  revalidateDocumentViews(toEntityType(entityType), entityId);
}

/**
 * Mints a short-lived signed URL for one document.
 *
 * The only read action here, and the only one a non-admin may call — which is
 * why it branches on role rather than calling requireAdmin(). An admin
 * resolves the path through getDocumentPath(); everyone else goes through
 * getClientVisibleDocumentPath(), which additionally requires the document to
 * have been deliberately shared. A client who guesses or scrapes a document
 * id therefore cannot mint a URL for an internal file.
 *
 * Two separate resolver functions, not one with a flag — see the two-function
 * rule at the top of src/lib/data/documents.ts.
 */
export async function getDocumentUrlAction(documentId: string): Promise<string> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Not signed in.");
  }
  if (!isStorageConfigured()) {
    throw new Error("File storage is not configured. See ENVIRONMENT_DEPLOY.md.");
  }

  const path =
    currentUser.role === Role.ADMIN
      ? await getDocumentPath(currentUser.tenantId, documentId)
      : await getClientVisibleDocumentPath(currentUser.tenantId, documentId);

  if (!path) {
    throw new Error("That document is not available.");
  }

  return createSignedDownloadUrl(path);
}
