import "server-only";
import { prisma } from "@/lib/prisma";
import { parseViewConfig, type ViewConfig } from "@/lib/views";

/**
 * Prisma-backed storage for per-user saved table views.
 *
 * ⚠️ THE SCOPING RULE HERE IS DIFFERENT FROM EVERY OTHER MODULE, deliberately.
 * Elsewhere the boundary is tenant (+ role); here it is tenant AND the owning
 * user, unconditionally, with no admin-wide reader at all. A saved view is
 * personal working state — even an admin has no business reading or
 * overwriting a colleague's. There is therefore no two-function split in this
 * file, because there is no second audience.
 *
 * Not audited, unlike documents and activities. AuditLog exists to answer
 * "who changed the business record, and from what" — a personal sort order is
 * not a business record, and logging every toolbar tweak would bury the rows
 * that matter under noise.
 */

export interface SavedViewSummary {
  id: string;
  name: string;
  scope: string;
  config: ViewConfig;
}

/** One user's saved views for one table, alphabetically. */
export async function getSavedViews(
  tenantId: string,
  userId: string,
  scope: string,
): Promise<SavedViewSummary[]> {
  const rows = await prisma.savedView.findMany({
    where: { tenantId, userId, scope },
    orderBy: { name: "asc" },
    select: { id: true, name: true, scope: true, config: true },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    scope: row.scope,
    // Parsed, never trusted: this column is untyped Json, so it can hold a
    // config written against an older shape of the app. parseViewConfig drops
    // what it does not recognise so a stale view degrades instead of throwing.
    config: parseViewConfig(row.config),
  }));
}

/**
 * Creates a view, or overwrites the one with the same name.
 *
 * Upsert rather than create, matching the `@@unique([userId, scope, name])`
 * constraint: someone saving "Overdue payments" twice means "update it", not
 * "make a second entry with the same label that I can no longer tell apart".
 */
export async function saveView(
  tenantId: string,
  userId: string,
  scope: string,
  name: string,
  config: ViewConfig,
): Promise<SavedViewSummary> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("A saved view needs a name.");
  }
  if (!scope.trim()) {
    throw new Error("A saved view needs a scope.");
  }

  const row = await prisma.savedView.upsert({
    where: { userId_scope_name: { userId, scope, name: trimmed } },
    create: {
      tenantId,
      userId,
      scope,
      name: trimmed,
      // Sanitised on the way in as well as on the way out. The client sends
      // this object, and it lands in an untyped Json column — without this,
      // an arbitrary payload would be stored verbatim and handed back to
      // every future reader.
      config: parseViewConfig(config) as never,
    },
    update: { config: parseViewConfig(config) as never },
    select: { id: true, name: true, scope: true, config: true },
  });

  return { id: row.id, name: row.name, scope: row.scope, config: parseViewConfig(row.config) };
}

/**
 * Deletes one of the caller's own saved views.
 *
 * `deleteMany` with id AND userId AND tenantId in one atomic `where` — the
 * same reasoning as updateDocument()'s use of updateMany, plus the owner
 * check that is this table's actual boundary. Throws rather than silently
 * no-opping when nothing matched, so deleting someone else's view is a loud
 * failure rather than a quiet success.
 */
export async function deleteSavedView(
  tenantId: string,
  userId: string,
  viewId: string,
): Promise<void> {
  const { count } = await prisma.savedView.deleteMany({
    where: { id: viewId, tenantId, userId },
  });

  if (count === 0) {
    throw new Error(`Saved view ${viewId} was not found for this user.`);
  }
}
