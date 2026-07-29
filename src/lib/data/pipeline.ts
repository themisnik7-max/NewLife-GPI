import "server-only";
import { prisma } from "@/lib/prisma";
import { AuditAction, recordAuditEvent, recordFieldChanges, type ActorContext } from "@/lib/data/audit";
import {
  CLOSED_STAGE_KEYS,
  FIRST_STAGE,
  LOST_STAGE,
  WON_STAGE,
  contactFullName,
  dealStageLabel,
  isKnownDealStage,
  type ContactView,
  type DealStageKey,
  type DealView,
} from "@/lib/pipeline";

/**
 * Prisma-backed read/write layer for the pre-sale pipeline.
 *
 * ⚠️ EVERY FUNCTION HERE IS ADMIN-ONLY, and unlike documents and activities
 * there is no client-facing counterpart to any of them — not one that has yet
 * to be written, one that must not exist. A prospect has no account and
 * therefore no session; a signed-up client has no business reading the
 * pipeline they were once a lead in, which holds the internal notes, the lost
 * reasons, and what the business privately thought the deal was worth. That
 * is why Contact and Deal carry no `visibleToClient` column at all: there is
 * no audience for one.
 *
 * Callers perform the role check, as with every other admin-only reader here.
 * Every write is audited in the same transaction as the change.
 */

const CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  nationality: true,
  source: true,
  notes: true,
  clerkUserId: true,
  ownerUserId: true,
  createdAt: true,
} as const;

const DEAL_SELECT = {
  id: true,
  title: true,
  stage: true,
  value: true,
  expectedCloseDate: true,
  wonAt: true,
  lostAt: true,
  lostReason: true,
  position: true,
  contactId: true,
  propertyId: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
  contact: { select: { firstName: true, lastName: true, email: true, clerkUserId: true } },
} as const;

interface DealRowWithContact {
  id: string;
  title: string;
  stage: string;
  value: unknown;
  expectedCloseDate: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
  lostReason: string | null;
  position: number;
  contactId: string;
  propertyId: string | null;
  ownerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  contact: { firstName: string; lastName: string | null; email: string | null; clerkUserId: string | null };
}

function toDealStage(raw: string): DealStageKey {
  if (!isKnownDealStage(raw)) {
    throw new Error(`Unrecognized deal stage from database: ${raw}`);
  }
  return raw;
}

function toDealView(row: DealRowWithContact, propertyNames: Map<string, string>): DealView {
  const stage = toDealStage(row.stage);
  return {
    id: row.id,
    title: row.title,
    stage,
    stageLabel: dealStageLabel(stage),
    // Prisma returns Decimal for a numeric column; converted at this boundary
    // so nothing downstream deals with Decimal — same rule as getTenantMetrics.
    value: row.value === null ? null : Number(row.value),
    expectedCloseDate: row.expectedCloseDate ? row.expectedCloseDate.toISOString().slice(0, 10) : null,
    wonAt: row.wonAt ? row.wonAt.toISOString() : null,
    lostAt: row.lostAt ? row.lostAt.toISOString() : null,
    lostReason: row.lostReason,
    position: row.position,
    contactId: row.contactId,
    contactName: contactFullName(row.contact.firstName, row.contact.lastName),
    contactEmail: row.contact.email,
    contactClerkUserId: row.contact.clerkUserId,
    propertyId: row.propertyId,
    propertyName: row.propertyId ? (propertyNames.get(row.propertyId) ?? null) : null,
    ownerUserId: row.ownerUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Property names for the deals that reference one, in a single query.
 *
 * Not a Prisma `include`: Deal has no relation to Property (the column is a
 * nullable id, kept that way so deleting a property does not cascade into the
 * pipeline), so the join has to be done here.
 */
async function resolvePropertyNames(
  tenantId: string,
  propertyIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(propertyIds.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return new Map();

  const properties = await prisma.property.findMany({
    // tenantId as well as the id list: a deal could otherwise name a property
    // in another tenant and have its name resolved here.
    where: { tenantId, id: { in: unique } },
    select: { id: true, name: true },
  });

  return new Map(properties.map((property) => [property.id, property.name]));
}

/** Every deal in the tenant, for the board and the forecast. */
export async function getDeals(tenantId: string): Promise<DealView[]> {
  const rows = await prisma.deal.findMany({
    where: { tenantId },
    orderBy: [{ stage: "asc" }, { position: "asc" }],
    select: DEAL_SELECT,
  });

  const propertyNames = await resolvePropertyNames(
    tenantId,
    rows.map((row) => row.propertyId),
  );
  return (rows as DealRowWithContact[]).map((row) => toDealView(row, propertyNames));
}

/** Every deal for one contact, newest first — for the contact's own page. */
export async function getContactDeals(tenantId: string, contactId: string): Promise<DealView[]> {
  const rows = await prisma.deal.findMany({
    where: { tenantId, contactId },
    orderBy: { createdAt: "desc" },
    select: DEAL_SELECT,
  });

  const propertyNames = await resolvePropertyNames(
    tenantId,
    rows.map((row) => row.propertyId),
  );
  return (rows as DealRowWithContact[]).map((row) => toDealView(row, propertyNames));
}

interface ContactRow {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  source: string | null;
  notes: string | null;
  clerkUserId: string | null;
  ownerUserId: string | null;
  createdAt: Date;
}

function toContactView(row: ContactRow, openDealCount: number): ContactView {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: contactFullName(row.firstName, row.lastName),
    email: row.email,
    phone: row.phone,
    nationality: row.nationality,
    source: row.source,
    notes: row.notes,
    clerkUserId: row.clerkUserId,
    ownerUserId: row.ownerUserId,
    createdAt: row.createdAt.toISOString(),
    openDealCount,
  };
}

/**
 * Every contact in the tenant with their open-deal count.
 *
 * The count comes from one grouped query rather than a `_count` include with
 * a filter, because the filter is on stage rather than on existence — and
 * emphatically not from a per-contact query in a loop, which is the mistake
 * getClientDirectory() documents avoiding for the same reason.
 */
export async function getContacts(tenantId: string): Promise<ContactView[]> {
  const [rows, openCounts] = await Promise.all([
    prisma.contact.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: CONTACT_SELECT,
    }),
    prisma.deal.groupBy({
      by: ["contactId"],
      where: { tenantId, stage: { notIn: [...CLOSED_STAGE_KEYS] } },
      _count: { _all: true },
    }),
  ]);

  const countByContact = new Map(
    openCounts.map((group) => [group.contactId, group._count._all]),
  );

  return rows.map((row) => toContactView(row, countByContact.get(row.id) ?? 0));
}

export async function getContact(tenantId: string, contactId: string): Promise<ContactView | null> {
  const row = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
    select: CONTACT_SELECT,
  });
  if (!row) return null;

  const openDealCount = await prisma.deal.count({
    where: { tenantId, contactId, stage: { notIn: [...CLOSED_STAGE_KEYS] } },
  });

  return toContactView(row, openDealCount);
}

export interface CreateContactInput {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  source?: string | null;
  notes?: string | null;
}

/**
 * Adds a prospect.
 *
 * Only `firstName` is required. Deliberately permissive: a lead often starts
 * as a name and a phone number scribbled after a call, and a form that
 * demands an email before it will save anything is a form people work around
 * by not using the CRM.
 */
export async function createContact(
  actor: ActorContext,
  input: CreateContactInput,
): Promise<ContactView> {
  if (!input.firstName?.trim()) {
    throw new Error("A contact needs at least a first name.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        tenantId: actor.tenantId,
        firstName: input.firstName.trim(),
        lastName: input.lastName?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        phone: input.phone?.trim() || null,
        nationality: input.nationality?.trim() || null,
        source: input.source?.trim() || null,
        notes: input.notes?.trim() || null,
        // The creating admin owns the relationship until someone reassigns it.
        ownerUserId: actor.actorUserId,
      },
      select: CONTACT_SELECT,
    });

    await recordAuditEvent(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.actorUserId,
      entityType: "Contact",
      entityId: contact.id,
      action: AuditAction.CREATE,
      metadata: { name: contactFullName(contact.firstName, contact.lastName), source: contact.source },
    });

    return contact;
  });

  return toContactView(created, 0);
}

export interface UpdateContactInput {
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  source?: string | null;
  notes?: string | null;
}

export async function updateContact(
  actor: ActorContext,
  contactId: string,
  input: UpdateContactInput,
): Promise<void> {
  if (input.firstName !== undefined && !input.firstName.trim()) {
    throw new Error("A contact needs at least a first name.");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.contact.findFirst({
      where: { id: contactId, tenantId: actor.tenantId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        nationality: true,
        source: true,
        notes: true,
      },
    });
    if (!existing) {
      throw new Error(`Contact ${contactId} was not found for tenant ${actor.tenantId}.`);
    }

    const pick = (next: string | null | undefined, current: string | null) =>
      next === undefined ? current : (next?.trim() || null);

    const next = {
      firstName: input.firstName?.trim() ?? existing.firstName,
      lastName: pick(input.lastName, existing.lastName),
      // Lower-cased on write so the conversion lookup, which matches an
      // incoming Clerk email, is not defeated by how someone typed it.
      email: input.email === undefined ? existing.email : (input.email?.trim().toLowerCase() || null),
      phone: pick(input.phone, existing.phone),
      nationality: pick(input.nationality, existing.nationality),
      source: pick(input.source, existing.source),
      notes: pick(input.notes, existing.notes),
    };

    await tx.contact.updateMany({
      where: { id: contactId, tenantId: actor.tenantId },
      data: next,
    });

    await recordFieldChanges(
      tx,
      {
        tenantId: actor.tenantId,
        actorUserId: actor.actorUserId,
        entityType: "Contact",
        entityId: contactId,
      },
      existing,
      next,
    );
  });
}

export interface CreateDealInput {
  contactId: string;
  title: string;
  stage?: DealStageKey;
  value?: number | null;
  propertyId?: string | null;
  expectedCloseDate?: Date | null;
}

/**
 * Opens a deal against a contact.
 *
 * Both referenced entities are verified to belong to the caller's tenant
 * BEFORE the write, not assumed from the ids — the rule ARCHITECTURE.md sets
 * out for every write, and the reason assignPropertyToClient() does the same.
 * Prisma bypasses RLS, so a crafted request naming another tenant's contact
 * would otherwise succeed.
 */
export async function createDeal(actor: ActorContext, input: CreateDealInput): Promise<DealView> {
  if (!input.title?.trim()) {
    throw new Error("A deal needs a title.");
  }
  if (input.value !== undefined && input.value !== null) {
    if (!Number.isFinite(input.value) || input.value < 0) {
      throw new Error("Deal value must be a positive number.");
    }
  }

  const stage = input.stage ?? FIRST_STAGE;
  if (!isKnownDealStage(stage)) {
    throw new Error(`Unrecognized deal stage: ${stage}`);
  }

  const created = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({
      where: { id: input.contactId, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (!contact) {
      throw new Error(`Contact ${input.contactId} was not found for tenant ${actor.tenantId}.`);
    }

    if (input.propertyId) {
      const property = await tx.property.findFirst({
        where: { id: input.propertyId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!property) {
        throw new Error(`Property ${input.propertyId} was not found for tenant ${actor.tenantId}.`);
      }
    }

    // New cards go to the bottom of their column. Reading the current maximum
    // rather than counting rows: positions are floats reshuffled by dragging,
    // so a count is not a position.
    const last = await tx.deal.findFirst({
      where: { tenantId: actor.tenantId, stage },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const deal = await tx.deal.create({
      data: {
        tenantId: actor.tenantId,
        contactId: input.contactId,
        propertyId: input.propertyId ?? null,
        title: input.title.trim(),
        stage,
        value: input.value ?? null,
        expectedCloseDate: input.expectedCloseDate ?? null,
        ownerUserId: actor.actorUserId,
        position: (last?.position ?? 0) + 1000,
      },
      select: DEAL_SELECT,
    });

    await recordAuditEvent(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.actorUserId,
      entityType: "Deal",
      entityId: deal.id,
      action: AuditAction.CREATE,
      metadata: { title: deal.title, stage, contactId: input.contactId },
    });

    return deal;
  });

  const propertyNames = await resolvePropertyNames(actor.tenantId, [
    (created as DealRowWithContact).propertyId,
  ]);
  return toDealView(created as DealRowWithContact, propertyNames);
}

/**
 * Moves a deal to a stage and a position — the drag-and-drop write.
 *
 * `wonAt`/`lostAt` are stamped and cleared here rather than being left to the
 * caller, so a deal dragged out of Won back onto the board cannot keep
 * claiming a win date. That is the kind of stale field that quietly corrupts
 * every "how many did we close in Q3" query later.
 *
 * The stage transition is audited as a field change, which is what makes
 * "how long does a deal sit at Offer?" answerable from the audit trail — the
 * question AuditLog was built for.
 */
export async function moveDeal(
  actor: ActorContext,
  dealId: string,
  stage: DealStageKey,
  position: number,
): Promise<void> {
  if (!isKnownDealStage(stage)) {
    throw new Error(`Unrecognized deal stage: ${stage}`);
  }
  if (!Number.isFinite(position)) {
    throw new Error("Deal position must be a finite number.");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.deal.findFirst({
      where: { id: dealId, tenantId: actor.tenantId },
      select: { stage: true, position: true, wonAt: true, lostAt: true },
    });
    if (!existing) {
      throw new Error(`Deal ${dealId} was not found for tenant ${actor.tenantId}.`);
    }

    const now = new Date();
    // Re-stamped only on entry, preserved while it stays there: dropping a
    // Won card one slot higher must not rewrite the date it was won.
    const wonAt = stage === WON_STAGE ? (existing.wonAt ?? now) : null;
    const lostAt = stage === LOST_STAGE ? (existing.lostAt ?? now) : null;

    await tx.deal.updateMany({
      where: { id: dealId, tenantId: actor.tenantId },
      data: { stage, position, wonAt, lostAt },
    });

    await recordFieldChanges(
      tx,
      {
        tenantId: actor.tenantId,
        actorUserId: actor.actorUserId,
        entityType: "Deal",
        entityId: dealId,
      },
      { stage: existing.stage },
      { stage },
    );
  });
}

export interface UpdateDealInput {
  title?: string;
  value?: number | null;
  propertyId?: string | null;
  expectedCloseDate?: Date | null;
  lostReason?: string | null;
}

export async function updateDeal(
  actor: ActorContext,
  dealId: string,
  input: UpdateDealInput,
): Promise<void> {
  if (input.title !== undefined && !input.title.trim()) {
    throw new Error("A deal needs a title.");
  }
  if (input.value !== undefined && input.value !== null) {
    if (!Number.isFinite(input.value) || input.value < 0) {
      throw new Error("Deal value must be a positive number.");
    }
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.deal.findFirst({
      where: { id: dealId, tenantId: actor.tenantId },
      select: {
        title: true,
        value: true,
        propertyId: true,
        expectedCloseDate: true,
        lostReason: true,
      },
    });
    if (!existing) {
      throw new Error(`Deal ${dealId} was not found for tenant ${actor.tenantId}.`);
    }

    if (input.propertyId) {
      const property = await tx.property.findFirst({
        where: { id: input.propertyId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!property) {
        throw new Error(`Property ${input.propertyId} was not found for tenant ${actor.tenantId}.`);
      }
    }

    const next = {
      title: input.title?.trim() ?? existing.title,
      value: input.value === undefined ? existing.value : input.value,
      propertyId: input.propertyId === undefined ? existing.propertyId : (input.propertyId || null),
      expectedCloseDate:
        input.expectedCloseDate === undefined ? existing.expectedCloseDate : input.expectedCloseDate,
      lostReason:
        input.lostReason === undefined ? existing.lostReason : (input.lostReason?.trim() || null),
    };

    await tx.deal.updateMany({
      where: { id: dealId, tenantId: actor.tenantId },
      data: next,
    });

    await recordFieldChanges(
      tx,
      {
        tenantId: actor.tenantId,
        actorUserId: actor.actorUserId,
        entityType: "Deal",
        entityId: dealId,
      },
      { ...existing, value: existing.value === null ? null : Number(existing.value) },
      { ...next, value: next.value === null ? null : Number(next.value) },
    );
  });
}

export async function deleteDeal(actor: ActorContext, dealId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.deal.findFirst({
      where: { id: dealId, tenantId: actor.tenantId },
      select: { title: true, stage: true },
    });
    if (!existing) {
      throw new Error(`Deal ${dealId} was not found for tenant ${actor.tenantId}.`);
    }

    await tx.deal.deleteMany({ where: { id: dealId, tenantId: actor.tenantId } });

    await recordAuditEvent(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.actorUserId,
      entityType: "Deal",
      entityId: dealId,
      action: AuditAction.DELETE,
      metadata: { title: existing.title, stage: existing.stage },
    });
  });
}

/**
 * Links a contact to the Clerk account that person has now created.
 *
 * THE CONVERSION MOMENT — the join between the pre-sale and post-sale halves
 * of this application. Called from the Clerk webhook handler when a new user
 * appears whose email matches a contact in the same tenant, so the calls,
 * viewings and notes recorded before they bought stay attached to them
 * afterwards instead of being stranded on a record nobody opens again.
 *
 * Matching on email is a heuristic and is treated as one: it links only when
 * exactly one contact in the tenant matches, and does nothing when several do
 * (two family members sharing an address) or when the contact is already
 * linked. A wrong link would attach one person's private notes to another's
 * account, so ambiguity resolves to "leave it for a human", never to a guess.
 *
 * Returns the id it linked, or null when it declined to.
 */
export async function linkContactToClerkUser(
  tenantId: string,
  email: string,
  clerkUserId: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const candidates = await prisma.contact.findMany({
    where: { tenantId, email: normalized, clerkUserId: null },
    select: { id: true },
    take: 2,
  });

  if (candidates.length !== 1) return null;

  const contactId = candidates[0].id;

  await prisma.$transaction(async (tx) => {
    await tx.contact.updateMany({
      where: { id: contactId, tenantId, clerkUserId: null },
      data: { clerkUserId },
    });

    await recordAuditEvent(tx, {
      tenantId,
      // The subject is acting on their own behalf by signing up — there is no
      // admin behind this write, and attributing it to one would be a lie in
      // the one table that exists to be trustworthy.
      actorUserId: clerkUserId,
      entityType: "Contact",
      entityId: contactId,
      action: AuditAction.UPDATE,
      field: "clerkUserId",
      oldValue: null,
      newValue: clerkUserId,
      metadata: { reason: "Clerk account created with a matching email" },
    });
  });

  return contactId;
}
