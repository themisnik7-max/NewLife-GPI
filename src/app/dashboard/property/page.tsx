import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { PropertyAssetCard } from "@/components/ui/PropertyAssetCard";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getClientPropertySnapshot } from "@/lib/data/propertyOwnership";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

export default async function PropertyPage() {
  const currentUser = await getCurrentUser();
  // Prisma path, scoped explicitly to this user's own id — the previous
  // Supabase/PostgREST version leaned on RLS to add that filter implicitly.
  const [snapshot, notifications] = await Promise.all([
    currentUser
      ? getClientPropertySnapshot(currentUser.tenantId, currentUser.userId)
      : Promise.resolve({ property: null }),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);
  const ownedProperty = snapshot.property;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeKey="property"
        client={{ property: currentUser?.email ?? "" }}
        isAdmin={currentUser?.role === Role.ADMIN}
      />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="My Property"
          subtitle="Your unit at a glance."
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {ownedProperty ? (
            <PropertyAssetCard property={ownedProperty} />
          ) : (
            <p className="text-sm text-stone-500">No property is currently assigned to your account.</p>
          )}
        </main>
      </div>
    </div>
  );
}
