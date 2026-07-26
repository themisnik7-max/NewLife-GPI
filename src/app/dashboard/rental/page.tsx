import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { RentalRoadmap } from "@/components/ui/RentalRoadmap";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getClientPropertySnapshot } from "@/lib/data/propertyOwnership";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

export default async function RentalPage() {
  const currentUser = await getCurrentUser();
  const [snapshot, notifications] = await Promise.all([
    currentUser
      ? getClientPropertySnapshot(currentUser.tenantId, currentUser.userId)
      : Promise.resolve({ property: null, rentalStage: null }),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);
  const currentStage = snapshot.rentalStage;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeKey="rental"
        client={{ property: currentUser?.email ?? "" }}
        isAdmin={currentUser?.role === Role.ADMIN}
      />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Rental & Leasing"
          subtitle="Track your property's rental progress."
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {currentStage ? (
            <RentalRoadmap currentStage={currentStage} />
          ) : (
            <p className="text-sm text-stone-500">No rental progress is available for your account yet.</p>
          )}
        </main>
      </div>
    </div>
  );
}
