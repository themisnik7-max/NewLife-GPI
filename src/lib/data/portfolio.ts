import "server-only";
import { prisma } from "@/lib/prisma";
import { toProject } from "@/lib/data/projects";
import { toDisplayName } from "@/lib/clientName";
import { RENTAL_STAGES } from "@/lib/rentalStages";
import type { Project } from "@/lib/projects";

/**
 * Property-centric admin views — the "admin is the source of record" half of
 * the data layer.
 *
 * Every other module here answers "what does THIS client have?"
 * (getUserLedger, getUserVisaSteps, getClientRentalStages). Those are the
 * right shape for a client's own pages and the wrong shape for a supervisor,
 * who needs the inverse: which properties have we sold, to whom, and which
 * are we letting. Building that by looping the per-client functions over
 * every user would be one query per client per page; these are single
 * queries with joins.
 *
 * READ-ONLY BY DESIGN. Nothing here writes. The corresponding writes live
 * with the entity they mutate (sale details in ./propertyOwnership.ts, the
 * rental listing flag in ./projects.ts) so each write stays next to its own
 * audit call rather than being duplicated in a second place.
 */

/** One buyer of a property, with the commercial facts of their purchase. */
export interface PropertyOwnerSummary {
  userId: string;
  name: string;
  email: string;
  /** The real date of sale, admin-entered. Null until someone records it. */
  saleDate: string | null;
  salePrice: number | null;
  /**
   * When the ownership was recorded in this application — deliberately
   * separate from saleDate above and never used as a substitute for it. For
   * anything sold before it was entered here, this is not the sale date.
   */
  recordedAt: string;
}

export interface SoldProperty {
  property: Project;
  owners: PropertyOwnerSummary[];
  /** Sum of recorded sale prices. Excludes owners with no price on file. */
  totalSaleValue: number;
  /** How many owners have no sale price recorded — the gap in the number above. */
  ownersMissingSalePrice: number;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface OwnershipRowUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface OwnershipRow {
  userId: string;
  saleDate: Date | null;
  // Prisma returns Decimal for numeric columns; Number() is applied at this
  // boundary so nothing downstream has to know about Decimal.
  salePrice: { toString(): string } | null;
  createdAt: Date;
  user: OwnershipRowUser;
}

function toOwnerSummary(row: OwnershipRow): PropertyOwnerSummary {
  return {
    userId: row.userId,
    name: toDisplayName(row.user.firstName, row.user.lastName, row.user.email),
    email: row.user.email,
    saleDate: row.saleDate ? toIsoDate(row.saleDate) : null,
    salePrice: row.salePrice === null ? null : Number(row.salePrice),
    recordedAt: row.createdAt.toISOString(),
  };
}

function summarise(property: Parameters<typeof toProject>[0], ownerships: OwnershipRow[]): SoldProperty {
  const owners = ownerships.map(toOwnerSummary);
  return {
    property: toProject(property),
    owners,
    totalSaleValue: owners.reduce((sum, owner) => sum + (owner.salePrice ?? 0), 0),
    // Surfaced rather than silently folded into the total: a portfolio value
    // computed from incomplete data is misleading unless the page can say
    // how incomplete it is.
    ownersMissingSalePrice: owners.filter((owner) => owner.salePrice === null).length,
  };
}

/**
 * Every property that has been sold, most recently sold first.
 *
 * "Sold" means at least one PropertyOwnership row exists. That is the only
 * honest signal in this schema — `availableUnits < totalUnits` would also
 * seem to imply it, but that counter is hand-maintained by an admin and can
 * disagree with the ownership rows, whereas an ownership row is created only
 * by an actual assignment.
 *
 * Ordered by the most recent sale date on each property, with properties
 * whose sale dates are all unrecorded sorted last rather than being treated
 * as very old. The ordering is done in application code because it depends
 * on an aggregate over the joined rows, and Prisma cannot express
 * "order the parent by max(child.field)" without dropping to raw SQL.
 */
export async function getSoldProperties(tenantId: string): Promise<SoldProperty[]> {
  const properties = await prisma.property.findMany({
    where: { tenantId, propertyOwnerships: { some: {} } },
    include: {
      propertyOwnerships: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      },
    },
  });

  return properties
    .map((property) => summarise(property, property.propertyOwnerships))
    .sort((a, b) => sortKey(b) - sortKey(a));
}

/**
 * Most recent known sale date, falling back to when the ownership was
 * recorded — the app timestamp is a weaker signal of recency than a real
 * sale date, but a better one than an arbitrary position.
 *
 * No empty-list guard: `Math.max()` of nothing is -Infinity, which sorts a
 * property with no owners last. That is the right answer, and writing an
 * explicit branch for it would only add a case no caller can reach
 * (getSoldProperties filters to properties that have owners).
 */
function sortKey(entry: SoldProperty): number {
  return Math.max(
    ...entry.owners.map((owner) => (owner.saleDate ? Date.parse(owner.saleDate) : Date.parse(owner.recordedAt))),
  );
}

/**
 * One sold property with its full buyer list — the drill-down from the
 * admin property list.
 *
 * Scoped by tenantId in the same `where` as the id, not checked afterwards:
 * Prisma bypasses RLS entirely, so this filter is the whole access-control
 * boundary (the same reasoning as getProjectById in ./projects.ts).
 *
 * Returns null for a property that exists but has never been sold, rather
 * than an entry with an empty owner list — the caller is a "sold property
 * detail" page, and rendering it for an unsold property would state
 * something untrue.
 */
export async function getSoldPropertyDetail(tenantId: string, propertyId: string): Promise<SoldProperty | null> {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    include: {
      propertyOwnerships: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      },
    },
  });

  if (!property || property.propertyOwnerships.length === 0) {
    return null;
  }

  return summarise(property, property.propertyOwnerships);
}

export interface RentalInventoryEntry {
  property: Project;
  /**
   * The client whose letting journey this is, or null for a unit listed for
   * rental that has not been assigned to anyone yet — a real and important
   * state, which is exactly what the explicit listing flag exists to make
   * visible.
   */
  client: { userId: string; name: string; email: string } | null;
  stagesCompleted: number;
  stagesTotal: number;
  /** Label of the furthest completed stage, or null if none are done. */
  currentStage: string | null;
}

/**
 * Every property in the lettings inventory, with each one's letting progress.
 *
 * Driven by `Property.listedForRental`, not by the presence of stage
 * records. Before that flag existed this view was impossible: the ten-stage
 * workflow hangs off a *user*, so a property was invisible as a rental until
 * someone had already ticked its first stage — which hid precisely the units
 * that need attention.
 *
 * A property with several owners produces one row per owner, since the
 * letting workflow is per-client. A property with none produces a single row
 * with `client: null`.
 */
export async function getRentalInventory(tenantId: string): Promise<RentalInventoryEntry[]> {
  const properties = await prisma.property.findMany({
    where: { tenantId, listedForRental: true },
    orderBy: { name: "asc" },
    include: {
      propertyOwnerships: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      },
    },
  });

  const userIds = properties.flatMap((property) => property.propertyOwnerships.map((o) => o.userId));

  // One query for every relevant stage record rather than one per client:
  // this page's row count grows with the inventory, and a per-row query
  // would make it grow the query count with it.
  const stageRows = userIds.length
    ? await prisma.rentalStageRecord.findMany({
        where: { tenantId, userId: { in: userIds }, status: "DONE" },
        select: { userId: true, stageKey: true, stageOrder: true },
      })
    : [];

  const doneByUser = new Map<string, { stageKey: string; stageOrder: number }[]>();
  for (const row of stageRows) {
    const list = doneByUser.get(row.userId) ?? [];
    list.push({ stageKey: row.stageKey, stageOrder: row.stageOrder });
    doneByUser.set(row.userId, list);
  }

  const stagesTotal = RENTAL_STAGES.length;

  // Return type annotated explicitly: without it TypeScript infers the
  // callback's type from the first branch alone, which narrows `client` to
  // non-null and then rejects the unassigned-property branch below.
  return properties.flatMap((property): RentalInventoryEntry[] => {
    const project = toProject(property);

    if (property.propertyOwnerships.length === 0) {
      return [{ property: project, client: null, stagesCompleted: 0, stagesTotal, currentStage: null }];
    }

    return property.propertyOwnerships.map((ownership) => {
      const done = doneByUser.get(ownership.userId) ?? [];
      // Furthest completed stage by the canonical list's order, not by
      // stage_order stored on the row — the code list stays the source of
      // truth if the denormalised copy ever disagrees. Stage keys no longer
      // in the list are skipped rather than throwing, matching
      // getClientRentalStages().
      const furthest = done
        .map((entry) => RENTAL_STAGES.find((stage) => stage.key === entry.stageKey))
        .filter((stage): stage is (typeof RENTAL_STAGES)[number] => Boolean(stage))
        .sort((a, b) => b.order - a.order)[0];

      return {
        property: project,
        client: {
          userId: ownership.userId,
          name: toDisplayName(ownership.user.firstName, ownership.user.lastName, ownership.user.email),
          email: ownership.user.email,
        },
        stagesCompleted: done.length,
        stagesTotal,
        currentStage: furthest?.label ?? null,
      };
    });
  });
}
