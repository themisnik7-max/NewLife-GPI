import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { RentalStageTracker } from "@/components/ui/RentalStageTracker";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getClientRentalStages } from "@/lib/data/rentalStages";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

export default async function RentalPage() {
  const currentUser = await getCurrentUser();
  const [stages, notifications] = await Promise.all([
    currentUser ? getClientRentalStages(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);

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
          {stages.length > 0 ? (
            <RentalStageTracker stages={stages} />
          ) : (
            <p className="text-sm text-stone-500">No rental progress is available for your account yet.</p>
          )}
        </main>
      </div>
    </div>
  );
}
