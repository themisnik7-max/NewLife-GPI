import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ConstructionMilestones } from "@/components/ui/ConstructionMilestones";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getOwnedProperty } from "@/lib/data/propertyOwnership";
import { getPropertyMilestones } from "@/lib/data/construction";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";

export default async function ConstructionPage() {
  const { getToken } = await auth();
  // Same "resolve the owned property first" shape as dashboard/property and
  // dashboard/rental: getOwnedProperty() is the Supabase/RLS path (needs the
  // token), getPropertyMilestones() is the Prisma path (needs no token, just
  // the tenantId + the propertyId this first call resolves).
  const [token, currentUser] = await Promise.all([getToken(), getCurrentUser()]);
  const [ownedProperty, notifications] = await Promise.all([
    currentUser ? getOwnedProperty(token, currentUser.tenantId) : Promise.resolve(null),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);
  const milestones =
    currentUser && ownedProperty ? await getPropertyMilestones(currentUser.tenantId, ownedProperty.id) : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="construction" client={{ property: currentUser?.email ?? "" }} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Construction"
          subtitle="Track your property's build progress."
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {milestones.length === 0 ? (
            <p className="text-sm text-stone-500">No construction milestones are on record for your property yet.</p>
          ) : (
            <ConstructionMilestones milestones={milestones} />
          )}
        </main>
      </div>
    </div>
  );
}
