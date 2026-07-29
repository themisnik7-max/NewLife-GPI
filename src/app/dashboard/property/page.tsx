import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { PropertyAssetCard } from "@/components/ui/PropertyAssetCard";
import { SoldPropertiesTable } from "@/components/ui/SoldPropertiesTable";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getClientPropertySnapshot } from "@/lib/data/propertyOwnership";
import { getSoldProperties } from "@/lib/data/portfolio";
import { getUserNotifications } from "@/lib/data/notifications";
import { getClientVisibleDocuments } from "@/lib/data/documents";
import { getClientVisibleTimeline } from "@/lib/data/activities";
import { DocumentPanel } from "@/components/ui/DocumentPanel";
import { ActivityTimeline } from "@/components/ui/ActivityTimeline";
import { RecordSalePanel } from "./RecordSalePanel";
import { getActiveProjects } from "@/lib/data/projects";
import { getClientDirectory } from "@/lib/data/clients";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

/**
 * One route, two genuinely different screens:
 *   - ADMIN: every property the business has sold, with its buyers and the
 *     commercial facts of each sale. The admin is the system of record, so
 *     "My Property" would be a category error for them — the sidebar renders
 *     "Properties Sold" instead (Sidebar's adminLabel).
 *   - TENANT: their own unit, unchanged.
 *
 * The admin branch deliberately does NOT reuse getClientPropertySnapshot():
 * that function is scoped to a single user's own ownership row, and in this
 * deployment the admin shares a tenant with a demo client — calling it here
 * would show the admin whichever property happened to be theirs, not the
 * portfolio (see the security note in src/lib/data/propertyOwnership.ts).
 */
export default async function PropertyPage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === Role.ADMIN;

  const [notifications, soldProperties, snapshot] = await Promise.all([
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
    currentUser && isAdmin ? getSoldProperties(currentUser.tenantId) : Promise.resolve([]),
    // Prisma path, scoped explicitly to this user's own id — the previous
    // Supabase/PostgREST version leaned on RLS to add that filter implicitly.
    currentUser && !isAdmin
      ? getClientPropertySnapshot(currentUser.tenantId, currentUser.userId)
      : Promise.resolve({ property: null }),
  ]);

  // Only the admin branch renders the record-sale dialog, so only it pays for
  // the pickers' data. A client visiting this page must not be billed a
  // roster query for a control they never see.
  const [saleProperties, saleClients] = currentUser && isAdmin
    ? await Promise.all([getActiveProjects(currentUser.tenantId), getClientDirectory(currentUser.tenantId)])
    : [[], []];

  /**
   * The client's own files, in two parts: those filed against them personally
   * (their lease, their passport) and those filed against their unit.
   *
   * getClientVisibleDocuments() on both, never getEntityDocuments() — this is
   * the client-facing branch, so anything an admin has not deliberately shared
   * must not appear. The admin branch of this page intentionally shows no
   * document panel at all: an admin looking at the whole portfolio has no
   * single record to attach files to, and the per-property panel already
   * lives on the property detail page.
   */
  const clientDocuments =
    currentUser && !isAdmin
      ? (
          await Promise.all([
            getClientVisibleDocuments(currentUser.tenantId, "User", currentUser.userId),
            snapshot.property
              ? getClientVisibleDocuments(currentUser.tenantId, "Property", snapshot.property.id)
              : Promise.resolve([]),
          ])
        ).flat()
      : [];

  // Shared activities only, and no system audit rows — see
  // getClientVisibleTimeline's doc comment on why those are never exposed.
  const clientTimeline =
    currentUser && !isAdmin
      ? await getClientVisibleTimeline(currentUser.tenantId, "User", currentUser.userId)
      : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="property" client={{ property: currentUser?.email ?? "" }} isAdmin={isAdmin} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title={isAdmin ? "Properties Sold" : "My Property"}
          subtitle={isAdmin ? "Every unit sold, and who bought it." : "Your unit at a glance."}
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
          isAdmin={isAdmin}
        />
        <main className="flex-1 space-y-6 bg-stone-50 p-8">
          {isAdmin ? (
            <>
              <RecordSalePanel
                properties={saleProperties.map((p) => ({ id: p.id, name: p.name, area: p.area }))}
                clients={saleClients.map((c) => ({ id: c.id, name: c.name, email: c.email }))}
              />
              <SoldPropertiesTable properties={soldProperties} />
            </>
          ) : (
            <>
              {snapshot.property ? (
                <PropertyAssetCard property={snapshot.property} />
              ) : (
                <p className="text-sm text-stone-500">
                  No property is currently assigned to your account.
                </p>
              )}
              {/* Read-only: no canManage, so the panel renders downloads and
              nothing else. The server re-checks admin role on every mutating
              action regardless — hiding the controls is usability, not
              security. entityId is the user's own id because that is the
              record this panel is anchored to; the property's files were
              merged into the same list above. */}
              <DocumentPanel
                documents={clientDocuments}
                entityType="User"
                entityId={currentUser?.userId ?? ""}
                title="My documents"
              />
              <ActivityTimeline
                entries={clientTimeline}
                entityType="User"
                entityId={currentUser?.userId ?? ""}
                title="Updates from your advisor"
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
