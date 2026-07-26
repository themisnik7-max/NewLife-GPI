import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ConstructionMilestones } from "@/components/ui/ConstructionMilestones";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getClientPropertySnapshot } from "@/lib/data/propertyOwnership";
import { getPropertyMilestones } from "@/lib/data/construction";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

export default async function ConstructionPage() {
  // Same "resolve the owned property first, then its milestones" shape as
  // before, but both steps are now the Prisma path — no Clerk token needed.
  const currentUser = await getCurrentUser();
  const [snapshot, notifications] = await Promise.all([
    currentUser
      ? getClientPropertySnapshot(currentUser.tenantId, currentUser.userId)
      : Promise.resolve({ property: null, rentalStage: null }),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);
  const milestones =
    currentUser && snapshot.property
      ? await getPropertyMilestones(currentUser.tenantId, snapshot.property.id)
      : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeKey="construction"
        client={{ property: currentUser?.email ?? "" }}
        isAdmin={currentUser?.role === Role.ADMIN}
      />
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
