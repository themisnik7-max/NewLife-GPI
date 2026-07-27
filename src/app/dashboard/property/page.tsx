import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { PropertyAssetCard } from "@/components/ui/PropertyAssetCard";
import { SoldPropertiesTable } from "@/components/ui/SoldPropertiesTable";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getClientPropertySnapshot } from "@/lib/data/propertyOwnership";
import { getSoldProperties } from "@/lib/data/portfolio";
import { getUserNotifications } from "@/lib/data/notifications";
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
        />
        <main className="flex-1 bg-stone-50 p-8">
          {isAdmin ? (
            <SoldPropertiesTable properties={soldProperties} />
          ) : snapshot.property ? (
            <PropertyAssetCard property={snapshot.property} />
          ) : (
            <p className="text-sm text-stone-500">No property is currently assigned to your account.</p>
          )}
        </main>
      </div>
    </div>
  );
}
