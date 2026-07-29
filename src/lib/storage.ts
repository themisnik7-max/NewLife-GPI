import "server-only";
import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SLOT_CONTENT_TYPES, type RentalStageSlot } from "@/lib/rentalStages";
import {
  MAX_DOCUMENT_BYTES,
  isAcceptedDocumentType,
  type DocumentEntityType,
} from "@/lib/documents";

/**
 * Supabase Storage — the only thing in this app that talks to Supabase
 * through anything other than Prisma.
 *
 * ⚠️ Worth stating explicitly, because `@supabase/supabase-js` was removed
 * from this project on 2026-07-27: this is NOT a reintroduction of the
 * PostgREST data path that was deleted then. That path read *table rows*
 * through PostgREST and depended on the Clerk↔Supabase Third-Party Auth JWT
 * bridge, which was never configured and 500'd three pages. This module
 * touches only the Storage API, authenticates with a server-side secret key,
 * and needs no JWT bridge at all. Every database read and write in the
 * application still goes through Prisma, exclusively.
 *
 * The secret key must never reach the browser — hence `server-only` above
 * and the deliberately un-prefixed env var name (no NEXT_PUBLIC_).
 */

export const RENTAL_DOCUMENTS_BUCKET = "rental-documents";

/** 10 MB. Generous for a signed PDF or a property photo, bounded enough
 * that a mistaken upload can't exhaust the storage quota in one go. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Whether file storage is usable at all.
 *
 * Callers check this so the feature degrades instead of exploding: if the
 * key isn't set, attachment slots render a "not configured" note and every
 * other part of the page keeps working. A missing optional integration
 * should not take down a page that also shows payments and visa progress.
 */
export function isStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_URL);
}

function getStorageClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "File storage is not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY. " +
        "See ENVIRONMENT_DEPLOY.md.",
    );
  }

  // Sessions are meaningless for a server-side secret-key client and
  // persisting them in a serverless environment would leak state between
  // invocations, so both are disabled explicitly.
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function extensionFor(filename: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : "bin";
}

export interface UploadRentalStageFileInput {
  tenantId: string;
  userId: string;
  stageKey: string;
  slot: Exclude<RentalStageSlot, "none">;
  file: File;
}

export interface StoredFile {
  path: string;
  filename: string;
}

/**
 * Uploads one stage attachment and returns where it landed.
 *
 * Content type is validated against the slot's allowlist server-side: the
 * browser's `accept` attribute is a convenience for the user, not a control,
 * and a hand-rolled request can send anything.
 *
 * Paths are namespaced `{tenantId}/{userId}/{stageKey}-{timestamp}.{ext}` so
 * one tenant's objects can never collide with another's, and the timestamp
 * means re-uploading keeps the prior object rather than silently destroying
 * the file an earlier audit row refers to.
 */
export async function uploadRentalStageFile(input: UploadRentalStageFileInput): Promise<StoredFile> {
  const allowed = SLOT_CONTENT_TYPES[input.slot];
  if (!allowed.includes(input.file.type)) {
    throw new Error(
      `This stage accepts ${input.slot === "pdf" ? "a PDF" : "an image"} — received "${input.file.type || "unknown"}".`,
    );
  }
  if (input.file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);
  }

  const client = getStorageClient();
  const path = `${input.tenantId}/${input.userId}/${input.stageKey}-${Date.now()}.${extensionFor(input.file.name)}`;

  const { error } = await client.storage
    .from(RENTAL_DOCUMENTS_BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  return { path, filename: input.file.name };
}

/**
 * Mints a short-lived signed URL for a stored object.
 *
 * The bucket is private, so this is the only way to read a file. The TTL is
 * deliberately short: the URL is generated at click time and is not meant to
 * be shareable or bookmarkable.
 */
export async function createSignedDownloadUrl(path: string): Promise<string> {
  const client = getStorageClient();

  const { data, error } = await client.storage
    .from(RENTAL_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create download link: ${error?.message ?? "unknown error"}`);
  }

  return data.signedUrl;
}

// ── General document store ───────────────────────────────────────────────
//
// The functions above serve the rental workflow's per-stage attachment slots.
// Those below serve the general Files panel that appears on every record.
// Both write into the same private bucket — a second bucket would double the
// provisioning and RLS surface for no isolation gain, since every path is
// already namespaced by tenant and nothing is ever read except through a
// server-minted signed URL.

/**
 * Path prefix for general documents, keeping them visually separate from the
 * rental-stage objects that already live at `{tenantId}/{userId}/...`.
 * Nothing depends on parsing this back out — it is for humans reading the
 * bucket, and the database row is the only real record of where a file sits.
 */
const DOCUMENT_PATH_PREFIX = "documents";

export interface UploadDocumentInput {
  tenantId: string;
  entityType: DocumentEntityType;
  entityId: string;
  file: File;
}

export interface StoredDocument extends StoredFile {
  contentType: string;
  sizeBytes: number;
}

/**
 * Uploads one general document and returns where it landed.
 *
 * Validation is server-side for the same reason uploadRentalStageFile()'s is:
 * the browser's `accept` attribute and any client-side size check are a
 * convenience for the user, not a control — a hand-rolled request can send
 * anything, and this bucket's contents are later served through signed URLs
 * that a browser will render.
 *
 * Paths are `documents/{tenantId}/{entityType}/{entityId}/{timestamp}-{rand}.{ext}`.
 * The tenant segment means one tenant's objects can never collide with
 * another's; the timestamp plus random suffix means uploading a second file
 * with the same name keeps both, rather than silently destroying the file an
 * existing database row and audit entry still point at.
 */
export async function uploadDocument(input: UploadDocumentInput): Promise<StoredDocument> {
  if (!isAcceptedDocumentType(input.file.type)) {
    throw new Error(
      `Unsupported file type "${input.file.type || "unknown"}" — upload a PDF or an image.`,
    );
  }
  if (input.file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`File is too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB).`);
  }
  if (input.file.size === 0) {
    throw new Error("File is empty.");
  }

  const client = getStorageClient();
  const unique = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const path =
    `${DOCUMENT_PATH_PREFIX}/${input.tenantId}/${input.entityType}/${input.entityId}/` +
    `${unique}.${extensionFor(input.file.name)}`;

  const { error } = await client.storage
    .from(RENTAL_DOCUMENTS_BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  return {
    path,
    filename: input.file.name,
    contentType: input.file.type,
    sizeBytes: input.file.size,
  };
}

/**
 * Removes a stored object.
 *
 * Called after the database row is deleted, never before: an orphaned object
 * costs storage and nothing else, whereas a row pointing at an object that no
 * longer exists renders a download button that always fails. Failures are
 * therefore the caller's to swallow — see deleteDocument() in
 * src/lib/data/documents.ts.
 */
export async function deleteStoredObject(path: string): Promise<void> {
  const client = getStorageClient();
  const { error } = await client.storage.from(RENTAL_DOCUMENTS_BUCKET).remove([path]);

  if (error) {
    throw new Error(`Failed to delete stored file: ${error.message}`);
  }
}
