import "server-only";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/auth/role";
import type { SearchResult } from "@/lib/search";

/**
 * Tenant-wide search behind the command palette (⌘K).
 *
 * ⚠️ ADMIN ONLY, and this module is the one where that matters most. Search
 * crosses every record type at once, which makes it the single widest read
 * path in the application — exactly the surface where a missing filter leaks
 * the most. Two rules hold everything together:
 *
 *  1. Every query filters by `tenantId`, always, with no exceptions and no
 *     "search everything" mode. Prisma bypasses RLS entirely, so this is the
 *     whole boundary (ARCHITECTURE.md).
 *  2. There is NO client-facing counterpart. A client has a handful of
 *     records, all already on their own pages; giving them a cross-record
 *     search would be building a leak surface to solve a problem they do not
 *     have. If one is ever needed it must be a separate function, per the
 *     two-function rule — never a role flag on this one.
 *
 * Callers must perform the admin role check themselves before calling, like
 * every other admin-only reader in this codebase.
 */

// Re-exported so server-side callers can keep importing the shape from the
// module that produces it; the definitions live in the client-safe
// src/lib/search.ts because CommandPalette needs them too.
export type { SearchResult, SearchResultKind } from "@/lib/search";

/** Per-kind cap. Deliberately small: a palette is for jumping to a known
 * record, not for browsing, and ten of each keeps the list scannable. */
const PER_KIND_LIMIT = 6;

/** Below this, the query is too broad to be useful and every keystroke would
 * scan four tables for nothing. */
const MIN_QUERY_LENGTH = 2;

/**
 * Searches clients, properties, documents and activities at once.
 *
 * `mode: "insensitive"` on every contains — a search that only matches the
 * exact casing someone typed is not a search. Postgres `ILIKE` under the
 * hood, which is unindexed here; acceptable at this data volume for the same
 * reason the view engine filters in memory (see src/lib/views.ts), and the
 * place to revisit first if it ever gets slow is a trigram index on the
 * columns below.
 */
export async function searchTenant(tenantId: string, query: string): Promise<SearchResult[]> {
  const term = query.trim();
  if (term.length < MIN_QUERY_LENGTH) return [];

  const contains = { contains: term, mode: "insensitive" as const };

  const [clients, properties, documents, activities] = await Promise.all([
    prisma.user.findMany({
      where: {
        tenantId,
        // Admins are excluded: the palette is for finding the people the
        // business serves, and an admin searching their own name expects to
        // find their clients, not themselves.
        role: Role.TENANT,
        OR: [
          { firstName: contains },
          { lastName: contains },
          { email: contains },
          { passportNumber: contains },
          { phone: contains },
        ],
      },
      take: PER_KIND_LIMIT,
      select: { id: true, firstName: true, lastName: true, email: true },
    }),

    prisma.property.findMany({
      where: {
        tenantId,
        OR: [{ name: contains }, { address: contains }, { area: contains }],
      },
      take: PER_KIND_LIMIT,
      select: { id: true, name: true, area: true, address: true },
    }),

    prisma.document.findMany({
      where: {
        tenantId,
        OR: [{ filename: contains }, { description: contains }],
      },
      take: PER_KIND_LIMIT,
      orderBy: { createdAt: "desc" },
      select: { id: true, filename: true, category: true, entityType: true, entityId: true },
    }),

    prisma.activity.findMany({
      where: {
        tenantId,
        OR: [{ subject: contains }, { body: contains }],
      },
      take: PER_KIND_LIMIT,
      orderBy: { createdAt: "desc" },
      select: { id: true, subject: true, type: true, entityType: true, entityId: true },
    }),
  ]);

  return [
    ...clients.map<SearchResult>((client) => ({
      kind: "client",
      id: client.id,
      title: [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || client.email,
      subtitle: client.email,
      href: `/dashboard/clients/${client.id}`,
    })),

    ...properties.map<SearchResult>((property) => ({
      kind: "property",
      id: property.id,
      title: property.name,
      subtitle: `${property.area} · ${property.address}`,
      href: `/dashboard/projects/${property.id}`,
    })),

    // Documents and activities link to the record they are filed against
    // rather than to themselves — neither has a page of its own, and landing
    // on the client or property that owns them is what someone searching for
    // "lease.pdf" actually wants.
    ...documents.map<SearchResult>((document) => ({
      kind: "document",
      id: document.id,
      title: document.filename,
      subtitle: hrefLabelFor(document.entityType),
      href: hrefForEntity(document.entityType, document.entityId),
    })),

    ...activities.map<SearchResult>((activity) => ({
      kind: "activity",
      id: activity.id,
      title: activity.subject,
      subtitle: `${activity.type.charAt(0)}${activity.type.slice(1).toLowerCase()} · ${hrefLabelFor(activity.entityType)}`,
      href: hrefForEntity(activity.entityType, activity.entityId),
    })),
  ];
}

function hrefForEntity(entityType: string, entityId: string): string {
  switch (entityType) {
    case "User":
      return `/dashboard/clients/${entityId}`;
    case "Property":
      return `/dashboard/projects/${entityId}`;
    case "PaymentLedger":
      return "/dashboard/payments";
    case "ConstructionMilestone":
      return "/dashboard/construction";
    default:
      // Never a dead link: the dashboard is a valid destination for a record
      // type this map has not learned yet.
      return "/dashboard";
  }
}

function hrefLabelFor(entityType: string): string {
  switch (entityType) {
    case "User":
      return "On a client";
    case "Property":
      return "On a property";
    case "PaymentLedger":
      return "On a payment";
    case "ConstructionMilestone":
      return "On a milestone";
    default:
      return entityType;
  }
}
