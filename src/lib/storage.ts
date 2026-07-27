import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SLOT_CONTENT_TYPES, type RentalStageSlot } from "@/lib/rentalStages";

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
