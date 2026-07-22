import "server-only";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { prisma } from "@/lib/prisma";
import { toProject as toProjectFromPrismaRow } from "@/lib/data/projects";
import type { Project, PropertyStatus } from "@/lib/projects";
import type { RentalStage } from "@/components/ui/RentalRoadmap";

// Raw shape of a `properties` row as PostgREST returns it (snake_case,
// dates already formatted as "YYYY-MM-DD" strings for `date` columns — no
// Date-object parsing step exists here the way it does in
// ./projects.ts's Prisma-backed toProject(), since Prisma returns real
// Date objects for @db.Date fields but PostgREST returns the column's
// native text representation directly).
interface PropertyRow {
  id: string;
  name: string;
  address: string;
  area: string;
  total_units: number;
  available_units: number;
  delivery_date: string;
  contract_date: string;
  floor: number;
  sqm: number;
  energy_class: string;
  image_url: string;
  status: string;
  map_url: string;
  ppt_url: string | null;
}

function toFrontendStatus(status: string): PropertyStatus {
  switch (status) {
    case "PLANNING":
    case "UNDER_CONSTRUCTION":
    case "COMPLETED":
      return status;
    default:
      // A raw string column, not a typed Prisma enum, so an unrecognized
      // value is reachable here (e.g. a manual DB edit) — fail loudly
      // rather than silently mis-rendering an invalid status.
      throw new Error(`Unrecognized property status from database: ${status}`);
  }
}

const REQUIRED_STRING_FIELDS: Array<keyof PropertyRow> = [
  "id",
  "name",
  "address",
  "area",
  "delivery_date",
  "contract_date",
  "energy_class",
  "image_url",
  "map_url",
];
const REQUIRED_NUMBER_FIELDS: Array<keyof PropertyRow> = ["total_units", "available_units", "floor", "sqm"];

/**
 * Supabase-js's generic type parameters (see the `.maybeSingle<...>()` call
 * below) are compile-time-only — nothing validates at runtime that a
 * returned row actually matches PropertyRow's shape. Without this check, a
 * NULL in a column TypeScript promises is a `number`/`string` (reachable
 * only via a manual DB edit today, since every one of these columns is
 * `NOT NULL` in the migration, but not something the type system itself
 * prevents at this boundary) would silently produce a Project object with
 * a `null` where a component expects a real value, surfacing later as a
 * rendering crash instead of a clear, traceable error right here.
 */
function assertValidPropertyRow(row: PropertyRow): void {
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof row[field] !== "string") {
      throw new Error(`Property row from Supabase is missing required field "${field}" (got ${typeof row[field]}).`);
    }
  }
  for (const field of REQUIRED_NUMBER_FIELDS) {
    if (typeof row[field] !== "number") {
      throw new Error(`Property row from Supabase is missing required field "${field}" (got ${typeof row[field]}).`);
    }
  }
}

function toProject(row: PropertyRow): Project {
  assertValidPropertyRow(row);

  return {
    id: row.id,
    name: row.name,
    address: row.address,
    area: row.area,
    totalUnits: row.total_units,
    availableUnits: row.available_units,
    deliveryDate: row.delivery_date,
    contractDate: row.contract_date,
    floor: row.floor,
    sqm: row.sqm,
    energyClass: row.energy_class,
    imageUrl: row.image_url,
    status: toFrontendStatus(row.status),
    mapUrl: row.map_url,
    pptUrl: row.ppt_url,
  };
}

/**
 * Fetches the signed-in user's most recently created owned property,
 * through Supabase PostgREST — not Prisma. Unlike getActiveProjects()/
 * getProjectById() in ./projects.ts, tenant and identity scoping here is
 * genuinely enforced by the database itself: the `property_ownerships_select`
 * RLS policy (supabase/migrations/0001_init.sql) restricts rows to
 * `tenant_id = app.current_tenant_id() and user_id = app.current_clerk_user_id()`
 * (or admin), resolved from the `token` argument's own JWT claims — this
 * function cannot return another tenant's or another user's row no matter
 * what `tenantId` is passed in.
 *
 * The explicit `.eq("tenant_id", tenantId)` filter below is therefore
 * defense-in-depth, not the enforcement mechanism itself: it makes the
 * tenant boundary visible in application code and fails closed if a future
 * RLS policy change ever regresses, rather than relying solely on a policy
 * defined three files away. See ARCHITECTURE.md's "Clerk ↔ Supabase
 * Third-Party Auth" section for why this distinction matters and how the
 * `token` this function requires gets resolved server-side.
 *
 * Returns null both when the user has no ownership row yet and when
 * `token` is unset/invalid (RLS then denies every row, which reads
 * identically to "none found") — callers should treat both the same way,
 * as an empty state rather than an error.
 */
export async function getOwnedProperty(token: string | null, tenantId: string): Promise<Project | null> {
  const supabase = getSupabaseClient(token);

  const { data, error } = await supabase
    .from("property_ownerships")
    .select("properties(*)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ properties: PropertyRow }>();

  // supabase-js resolves errors onto `error`, it does not throw — unlike
  // the Prisma client, an unchecked error here would silently look
  // identical to "no ownership row found".
  if (error) {
    throw new Error(`Failed to fetch owned property: ${error.message}`);
  }

  if (!data?.properties) {
    return null;
  }

  return toProject(data.properties);
}

const VALID_RENTAL_STAGES: ReadonlySet<string> = new Set([
  "RESERVATION",
  "SPA_SIGNED",
  "LEGAL_REVIEW",
  "VENDORS_ENGAGED",
  "VISA_SUBMISSION",
  "VISA_APPROVED",
  "CONSTRUCTION_START",
  "INTERIOR_CHOICES",
  "HANDOVER",
  "RENTAL_ACTIVE",
]);

function toRentalStage(rawStage: string): RentalStage {
  if (!VALID_RENTAL_STAGES.has(rawStage)) {
    throw new Error(`Unrecognized rental_stage value from database: ${rawStage}`);
  }
  return rawStage as RentalStage;
}

/**
 * Fetches the signed-in user's current rental stage — same table, RLS
 * policy, and tenant/identity scoping reasoning as getOwnedProperty()
 * above, just selecting `rental_stage` instead of the joined property.
 * Kept as its own query rather than folded into getOwnedProperty(): the
 * two are used by different pages (My Property vs. Rental & taxes) that
 * don't otherwise need each other's data, and Project (src/lib/projects.ts)
 * deliberately has no rentalStage field of its own — it describes a
 * Property, not a PropertyOwnership.
 */
export async function getCurrentRentalStage(token: string | null, tenantId: string): Promise<RentalStage | null> {
  const supabase = getSupabaseClient(token);

  const { data, error } = await supabase
    .from("property_ownerships")
    .select("rental_stage")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ rental_stage: string }>();

  if (error) {
    throw new Error(`Failed to fetch rental stage: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return toRentalStage(data.rental_stage);
}

export interface ClientPropertySnapshot {
  property: Project | null;
  rentalStage: RentalStage | null;
}

/**
 * Prisma-path counterpart to getOwnedProperty()/getCurrentRentalStage()
 * above, added for the admin client-detail page
 * (src/app/dashboard/clients/[userId]/page.tsx). Those two functions are
 * Supabase/RLS-backed and require a `token` representing the CALLING user's
 * own Clerk session — which only works for viewing your own data. An admin
 * viewing a *different* client's overview has no token for that other
 * user, and RLS would deny the request even if one were fabricated. This
 * bypasses RLS entirely (like every other Prisma-path function here) and
 * relies on the caller having already verified admin/tenant authorization —
 * see getClientOverviewData-style callers, which check role before this is
 * ever invoked. Combines property + rentalStage in one query since both
 * live on the same PropertyOwnership row; the Supabase path fetches them
 * separately only because that reads more naturally through PostgREST's
 * embedded-resource syntax.
 */
export async function getClientPropertySnapshot(tenantId: string, userId: string): Promise<ClientPropertySnapshot> {
  const ownership = await prisma.propertyOwnership.findFirst({
    where: { userId, tenantId },
    orderBy: { createdAt: "desc" },
    include: { property: true },
  });

  if (!ownership) {
    return { property: null, rentalStage: null };
  }

  return {
    property: toProjectFromPrismaRow(ownership.property),
    rentalStage: ownership.rentalStage,
  };
}
