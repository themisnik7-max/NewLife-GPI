import "server-only";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/auth/role";
import { toDisplayName } from "@/lib/clientName";
import { recordFieldChanges, type ActorContext } from "@/lib/data/audit";
import { RENTAL_STAGES } from "@/lib/rentalStages";
import type { Client } from "@/components/ui/ClientTable";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Fetches every non-admin user in a tenant, shaped for ClientTable — the
 * data behind the admin view of Overview (src/app/dashboard/page.tsx).
 *
 * `status` is always "Active": ClientTable's ClientStatus type also allows
 * "Onboarding"/"Pending documents"/"Inactive", carried over from the
 * original mock data, but nothing in this schema tracks any such lifecycle
 * today — there is no real signal to derive those other values from, so
 * showing them here would be fabricated, not "wrong data made honest."
 */
export async function getTenantClients(tenantId: string): Promise<Client[]> {
  const users = await prisma.user.findMany({
    where: { tenantId, role: Role.TENANT },
    orderBy: { createdAt: "desc" },
    include: {
      propertyOwnerships: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { property: true },
      },
    },
  });

  return users.map((user) => {
    const ownership = user.propertyOwnerships[0];
    return {
      id: user.id,
      name: toDisplayName(user.firstName, user.lastName, user.email),
      email: user.email,
      property: ownership ? `${ownership.property.name} — ${ownership.property.area}` : "No property assigned",
      status: "Active",
      joinedDate: dateFormatter.format(user.createdAt),
    };
  });
}

// ── Client directory ──────────────────────────────────────────────────────

/**
 * A client row on the admin Clients page — identity plus a one-glance
 * position in each of the four workflows.
 *
 * Richer than `Client` above (which backs the older, narrower ClientTable)
 * because this page is the admin's roster: the point is to see who needs
 * attention without opening each profile in turn.
 */
export interface ClientDirectoryEntry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  nationality: string | null;
  property: string | null;
  joinedDate: string;
  visa: { completed: number; total: number };
  rental: { completed: number; total: number };
  /** Unpaid balance across every installment. 0 when nothing is billed. */
  outstanding: number;
}

/**
 * Every client in the tenant with their cross-workflow position.
 *
 * Deliberately one query with nested selects rather than the per-client
 * functions (getUserVisaSteps, getClientRentalStages, getUserLedger) in a
 * loop: those are correct for one client's own page, but calling three of
 * them per row turns a 40-client roster into 120 round trips.
 *
 * Only counts and sums are pulled through the joins, never full rows — the
 * page renders "3 of 5", so fetching every visa step's title and description
 * to then discard them would be waste that grows with the data.
 */
export async function getClientDirectory(tenantId: string): Promise<ClientDirectoryEntry[]> {
  const users = await prisma.user.findMany({
    where: { tenantId, role: Role.TENANT },
    orderBy: { createdAt: "desc" },
    include: {
      propertyOwnerships: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { property: { select: { name: true, area: true } } },
      },
      visaSteps: { select: { status: true } },
      rentalStageRecords: { select: { status: true } },
      paymentLedgers: { select: { amount: true, amountPaid: true } },
    },
  });

  return users.map((user) => {
    const ownership = user.propertyOwnerships[0];
    const outstanding = user.paymentLedgers.reduce(
      (sum, entry) => sum + Math.max(entry.amount - entry.amountPaid, 0),
      0,
    );

    return {
      id: user.id,
      name: toDisplayName(user.firstName, user.lastName, user.email),
      email: user.email,
      phone: user.phone,
      nationality: user.nationality,
      property: ownership ? `${ownership.property.name} — ${ownership.property.area}` : null,
      joinedDate: dateFormatter.format(user.createdAt),
      visa: {
        completed: user.visaSteps.filter((step) => step.status === "COMPLETED").length,
        // Per-client total, not a fixed number: unlike the rental workflow,
        // visa steps are created individually per client, so a client with
        // no steps yet genuinely has a denominator of zero.
        total: user.visaSteps.length,
      },
      rental: {
        completed: user.rentalStageRecords.filter((record) => record.status === "DONE").length,
        // Fixed at the canonical stage count, unlike visa above: absence of a
        // row means PENDING, so the denominator is the code list's length,
        // never the number of stored rows.
        total: RENTAL_STAGES.length,
      },
      outstanding,
    };
  });
}

// ── Profiles ──────────────────────────────────────────────────────────────

/**
 * The admin-maintained profile fields, without identity.
 *
 * Name and email are absent on purpose: Clerk owns those and syncs them by
 * webhook, so they are not editable here and including them in an "update"
 * payload would invite someone to try.
 */
export interface ClientProfileInput {
  phone?: string | null;
  nationality?: string | null;
  passportNumber?: string | null;
  /** ISO date (YYYY-MM-DD), or null to clear. */
  dateOfBirth?: string | null;
  adminNotes?: string | null;
}

export interface ClientProfile {
  id: string;
  name: string;
  email: string;
  joinedDate: string;
  phone: string | null;
  nationality: string | null;
  passportNumber: string | null;
  dateOfBirth: string | null;
  /**
   * Admin-only. Present on this type but populated ONLY by
   * getClientProfile(); getOwnClientProfile() always returns null here —
   * see the comment on that function.
   */
  adminNotes: string | null;
}

const PROFILE_FIELDS = ["phone", "nationality", "passportNumber", "dateOfBirth", "adminNotes"] as const;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Reads one client's full profile, including admin-only notes.
 *
 * ADMIN CALLERS ONLY. Callers must have already established that the session
 * is an admin — this function takes a subject userId that is not the caller's
 * own, so it cannot make that check itself. Prisma bypasses RLS, so nothing
 * below this line will catch a misuse.
 */
export async function getClientProfile(tenantId: string, userId: string): Promise<ClientProfile | null> {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) return null;

  return {
    id: user.id,
    name: toDisplayName(user.firstName, user.lastName, user.email),
    email: user.email,
    joinedDate: dateFormatter.format(user.createdAt),
    phone: user.phone,
    nationality: user.nationality,
    passportNumber: user.passportNumber,
    dateOfBirth: user.dateOfBirth ? toIsoDate(user.dateOfBirth) : null,
    adminNotes: user.adminNotes,
  };
}

/**
 * Reads a client's own profile for their own page, with admin notes omitted.
 *
 * A SEPARATE FUNCTION rather than a boolean flag on getClientProfile(), and
 * this is the load-bearing part: RLS does not protect this field. The
 * users_select policy from 0001_init.sql lets a client read their own row,
 * which now includes admin_notes — and the app reads through Prisma, which
 * ignores RLS entirely. Withholding the field is therefore purely this
 * function's job. A flag defaulting the wrong way, or a caller passing the
 * wrong value, would silently show a client what their agent wrote about
 * them; two functions make the mistake impossible to make by omission.
 */
export async function getOwnClientProfile(tenantId: string, userId: string): Promise<ClientProfile | null> {
  const profile = await getClientProfile(tenantId, userId);
  return profile ? { ...profile, adminNotes: null } : null;
}

/**
 * Updates a client's admin-maintained profile fields.
 *
 * Only keys actually present in `input` are written, so a form that submits
 * one section cannot blank the fields it did not render. An explicit `null`
 * is honoured as "clear this", which is why the check is on key presence
 * rather than on the value being falsy — a passport number legitimately
 * needs to be erasable.
 *
 * Every changed field lands in the audit trail individually. That includes
 * adminNotes: notes about a client are exactly the kind of record where
 * "who wrote this, and when" matters later.
 */
export async function updateClientProfile(
  actor: ActorContext,
  userId: string,
  input: ClientProfileInput,
): Promise<void> {
  const tenantId = actor.tenantId;

  if (input.dateOfBirth !== undefined && input.dateOfBirth !== null) {
    if (Number.isNaN(Date.parse(input.dateOfBirth))) {
      throw new Error(`dateOfBirth is not a valid date: ${input.dateOfBirth}`);
    }
    if (Date.parse(input.dateOfBirth) > Date.now()) {
      throw new Error("dateOfBirth cannot be in the future.");
    }
  }

  const existing = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!existing) {
    throw new Error(`User ${userId} was not found for tenant ${tenantId}.`);
  }

  const data: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    if (input[field] === undefined) continue;
    // Whitespace-only input is stored as NULL rather than as " ", so
    // "unset" has exactly one representation in the column and analysis
    // queries do not have to defend against a second one.
    const raw = input[field];
    const value = typeof raw === "string" && !raw.trim() ? null : raw;
    data[field] = field === "dateOfBirth" && value ? new Date(value as string) : value;
    after[field] = value;
  }

  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    // updateMany with id + tenantId in one atomic where, not update(): the
    // same reasoning as updateProperty() in ./projects.ts — update()'s where
    // accepts only a unique field, which would drop the tenant filter.
    await tx.user.updateMany({ where: { id: userId, tenantId }, data });

    await recordFieldChanges(
      tx,
      {
        tenantId,
        actorUserId: actor.actorUserId,
        entityType: "User",
        entityId: userId,
        metadata: { subjectUserId: userId },
      },
      {
        phone: existing.phone,
        nationality: existing.nationality,
        passportNumber: existing.passportNumber,
        dateOfBirth: existing.dateOfBirth ? toIsoDate(existing.dateOfBirth) : null,
        adminNotes: existing.adminNotes,
      },
      after,
    );
  });
}
