import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { PropertyAssetCard } from "@/components/ui/PropertyAssetCard";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getOwnedProperty } from "@/lib/data/propertyOwnership";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

export default async function PropertyPage() {
  const { getToken } = await auth();
  // Fetched through Supabase PostgREST (RLS-enforced), not Prisma — see
  // ARCHITECTURE.md's "Clerk ↔ Supabase Third-Party Auth" section.
  const [token, currentUser] = await Promise.all([getToken(), getCurrentUser()]);
  const [ownedProperty, notifications] = await Promise.all([
    currentUser ? getOwnedProperty(token, currentUser.tenantId) : Promise.resolve(null),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);

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
