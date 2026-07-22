import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { RentalRoadmap } from "@/components/ui/RentalRoadmap";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getCurrentRentalStage } from "@/lib/data/propertyOwnership";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";

export default async function RentalPage() {
  const { getToken } = await auth();
  const [token, currentUser] = await Promise.all([getToken(), getCurrentUser()]);
  const [currentStage, notifications] = await Promise.all([
    currentUser ? getCurrentRentalStage(token, currentUser.tenantId) : Promise.resolve(null),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="rental" client={{ property: currentUser?.email ?? "" }} />
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
