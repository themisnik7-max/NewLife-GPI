import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { ApiKeyStatus as PrismaApiKeyStatus } from "@/generated/prisma/client";
import type { ApiKeyCardData, ApiKeyProvider, ApiKeyStatus } from "@/components/ui/ApiKeyCard";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96-bit IV — the size AES-GCM is designed for.
const MASK_PREFIX_LENGTH = 7;
const MASK_SUFFIX_LENGTH = 4;
const MASK_BULLET_COUNT = 8;

function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("API_KEY_ENCRYPTION_SECRET is not set — cannot encrypt or decrypt API keys.");
  }
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) {
    throw new Error("API_KEY_ENCRYPTION_SECRET must decode to exactly 32 bytes (AES-256) from base64.");
  }
  return key;
}

/**
 * Encrypts raw key material with AES-256-GCM. The schema has separate
 * encryptedKey/encryptionIv columns but none for GCM's authentication tag —
 * rather than adding a column for it, the tag is appended to encryptedKey
 * as `<base64 ciphertext>.<base64 authTag>`. Both pieces are required to
 * decrypt or even verify integrity, so they always travel together as one
 * unit rather than as two independently-storable values.
 */
function encryptKeyMaterial(rawKeyMaterial: string): { encryptedKey: string; encryptionIv: string } {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawKeyMaterial, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedKey: `${ciphertext.toString("base64")}.${authTag.toString("base64")}`,
    encryptionIv: iv.toString("base64"),
  };
}

/**
 * Reverses encryptKeyMaterial(). Throws (via GCM's own authentication
 * check inside decipher.final()) if encryptedKey/encryptionIv have been
 * tampered with or don't actually match this key — GCM verifies integrity
 * as part of decrypting, it doesn't decrypt-then-separately-verify.
 */
function decryptKeyMaterial(encryptedKey: string, encryptionIv: string): string {
  const key = getEncryptionKey();
  const [ciphertextB64, authTagB64] = encryptedKey.split(".");
  if (!ciphertextB64 || !authTagB64) {
    throw new Error("encryptedKey is not in the expected <ciphertext>.<authTag> format.");
  }

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(encryptionIv, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);

  return plaintext.toString("utf8");
}

/**
 * Masks raw key material for display, matching the shape already
 * established by ApiKeyCard.tsx's own mock data ("sk-ant-••••••••••••wq7A")
 * — a short real prefix, a run of bullets, then the last 4 real characters.
 * The task's own illustrative example ("nk-...xxxx") is intentionally not
 * used here: ApiKeyCard.tsx and its test suite already exist and were built
 * around this exact convention, and matching already-shipped, already-
 * tested UI beats introducing a second, conflicting masked-key format.
 */
function buildMaskedKey(rawKeyMaterial: string): string {
  const bullets = "•".repeat(MASK_BULLET_COUNT);
  if (rawKeyMaterial.length <= MASK_PREFIX_LENGTH + MASK_SUFFIX_LENGTH) {
    // Too short to reveal both ends without exposing most of the secret —
    // mask everything except the last 4 characters.
    return `${bullets}${rawKeyMaterial.slice(-MASK_SUFFIX_LENGTH)}`;
  }
  const prefix = rawKeyMaterial.slice(0, MASK_PREFIX_LENGTH);
  const suffix = rawKeyMaterial.slice(-MASK_SUFFIX_LENGTH);
  return `${prefix}${bullets}${suffix}`;
}

function toFrontendStatus(status: PrismaApiKeyStatus): ApiKeyStatus {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "REVOKED":
      return "revoked";
  }
}

function toFrontendProvider(provider: string): ApiKeyProvider {
  if (provider === "anthropic" || provider === "openai") {
    return provider;
  }
  throw new Error(`Unrecognized API key provider from database: ${provider}`);
}

// ISO date strings, matching the same convention as src/lib/data/projects.ts
// and src/lib/data/propertyOwnership.ts — not the human-readable "3 May
// 2026" format ApiKeyCard.tsx's current mock uses, since that's a display
// concern the data layer shouldn't own. Wiring a real page to this module
// will need to either reformat at render time or accept the ISO form.
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface ApiKeyRow {
  id: string;
  provider: string;
  label: string;
  maskedKey: string;
  status: PrismaApiKeyStatus;
  createdAt: Date;
  lastUsedAt: Date | null;
}

function toApiKeyCardData(row: ApiKeyRow): ApiKeyCardData {
  return {
    id: row.id,
    provider: toFrontendProvider(row.provider),
    label: row.label,
    maskedKey: row.maskedKey,
    createdAt: toIsoDate(row.createdAt),
    lastUsedAt: row.lastUsedAt ? toIsoDate(row.lastUsedAt) : null,
    status: toFrontendStatus(row.status),
  };
}

/**
 * Fetches every API key belonging to a tenant, most recently created first.
 *
 * `userId` is accepted for logging/attribution only — per the resolved BYOK
 * scoping decision, EncryptedApiKey has no user-level column at all (see
 * its doc comment in schema.prisma): these are shared, tenant-wide org
 * credentials by design, not per-user keys. `tenantId` is the entire
 * isolation boundary here; `userId` is deliberately absent from the Prisma
 * `where` clause because there is no column for it to filter on.
 */
export async function getTenantApiKeys(tenantId: string, userId: string): Promise<ApiKeyCardData[]> {
  console.info(`Listing API keys for tenant ${tenantId} (requested by user ${userId})`);

  const rows = await prisma.encryptedApiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  return rows.map(toApiKeyCardData);
}

/**
 * Encrypts and stores a new tenant-wide API key.
 *
 * `provider` is not in the literally-requested parameter list, but
 * EncryptedApiKey.provider is a required column with no sensible default —
 * there is no "unspecified provider" value — so it has to be supplied by
 * the caller for this to insert a valid row at all.
 */
export async function createTenantApiKey(
  tenantId: string,
  userId: string,
  provider: ApiKeyProvider,
  label: string,
  rawKeyMaterial: string,
): Promise<ApiKeyCardData> {
  if (!rawKeyMaterial.trim()) {
    throw new Error("rawKeyMaterial must not be empty.");
  }

  console.info(`Creating a new ${provider} API key for tenant ${tenantId} (created by user ${userId})`);

  const { encryptedKey, encryptionIv } = encryptKeyMaterial(rawKeyMaterial);
  const maskedKey = buildMaskedKey(rawKeyMaterial);

  const created = await prisma.encryptedApiKey.create({
    data: {
      tenantId,
      provider,
      label,
      maskedKey,
      encryptedKey,
      encryptionIv,
      status: PrismaApiKeyStatus.ACTIVE,
    },
  });

  return toApiKeyCardData(created);
}

/**
 * Revokes a specific tenant API key.
 *
 * Uses `updateMany` rather than `update` specifically so `id` and
 * `tenantId` can be combined in one atomic `where` — `update`'s `where`
 * only accepts a single unique field, which would otherwise force a
 * separate existence check first (a TOCTOU gap) or filtering by `id` alone
 * with no tenant check at all. Throws, rather than failing silently, when
 * nothing matched: a caller passing an apiKeyId and a tenantId that don't
 * actually belong together is exactly the class of bug this exists to
 * catch, not paper over.
 */
export async function revokeTenantApiKey(tenantId: string, userId: string, apiKeyId: string): Promise<void> {
  console.info(`Revoking API key ${apiKeyId} for tenant ${tenantId} (requested by user ${userId})`);

  const result = await prisma.encryptedApiKey.updateMany({
    where: { id: apiKeyId, tenantId },
    data: { status: PrismaApiKeyStatus.REVOKED },
  });

  if (result.count === 0) {
    throw new Error(`API key ${apiKeyId} was not found for tenant ${tenantId}.`);
  }
}

/**
 * Fetches and decrypts a specific tenant API key's real secret value — the
 * one function in this module that ever returns raw key material. Meant to
 * be called immediately before making a request to the actual provider
 * (Anthropic/OpenAI), never logged, never sent to the client — every other
 * function here deliberately returns only the masked view.
 *
 * Scoped to `status: ACTIVE` as well as `tenantId`: a revoked key must
 * never become usable again through this path just because its ciphertext
 * still physically exists in the row.
 *
 * Returns null for "not found, wrong tenant, or revoked" uniformly, the
 * same reasoning as getOwnedProperty() in ./propertyOwnership.ts — a
 * caller shouldn't be able to distinguish "wrong tenant" from "doesn't
 * exist" from the return value alone.
 */
export async function getDecryptedApiKey(tenantId: string, apiKeyId: string): Promise<string | null> {
  const row = await prisma.encryptedApiKey.findFirst({
    where: { id: apiKeyId, tenantId, status: PrismaApiKeyStatus.ACTIVE },
  });

  if (!row) {
    return null;
  }

  const decrypted = decryptKeyMaterial(row.encryptedKey, row.encryptionIv);

  // Best-effort usage tracking: awaited so it's deterministic in tests and
  // normal operation, but a failure here must never prevent the caller
  // from getting the key they actually asked for — logged, not rethrown.
  await prisma.encryptedApiKey
    .update({ where: { id: apiKeyId }, data: { lastUsedAt: new Date() } })
    .catch((err: unknown) => {
      console.error(`Failed to update lastUsedAt for API key ${apiKeyId}:`, err);
    });

  return decrypted;
}
