import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { RentalStageTracker } from "@/components/ui/RentalStageTracker";
import { RentalInventoryTable } from "@/components/ui/RentalInventoryTable";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getClientRentalStages } from "@/lib/data/rentalStages";
import { getRentalInventory } from "@/lib/data/portfolio";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

/**
 * ADMIN sees the lettings inventory — every property flagged for rental and
 * how far each letting has progressed. TENANT sees their own ten-stage
 * workflow, unchanged.
 *
 * The admin view is driven by Property.listedForRental, not by the presence
 * of stage records: the stage records hang off a user, so before that flag a
 * unit was invisible here until someone ticked its first stage — hiding
 * exactly the units that need attention.
 */
export default async function RentalPage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === Role.ADMIN;

  const [notifications, inventory, stages] = await Promise.all([
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
    currentUser && isAdmin ? getRentalInventory(currentUser.tenantId) : Promise.resolve([]),
    currentUser && !isAdmin
      ? getClientRentalStages(currentUser.tenantId, currentUser.userId)
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="rental" client={{ property: currentUser?.email ?? "" }} isAdmin={isAdmin} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title={isAdmin ? "Rentals" : "Rental & Leasing"}
          subtitle={
            isAdmin ? "Every property listed for rental." : "Track your property's rental progress."
          }
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
          isAdmin={isAdmin}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {isAdmin ? (
            <RentalInventoryTable entries={inventory} />
          ) : stages.length > 0 ? (
            <RentalStageTracker stages={stages} />
          ) : (
            <p className="text-sm text-stone-500">No rental progress is available for your account yet.</p>
          )}
        </main>
      </div>
    </div>
  );
}
