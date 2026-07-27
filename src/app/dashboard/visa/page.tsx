import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { VisaTimeline } from "@/components/ui/VisaTimeline";
import { AdminVisaOverview } from "@/components/ui/AdminVisaOverview";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserVisaSteps, getTenantVisaOverview } from "@/lib/data/visa";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

/**
 * ADMIN sees every client's application; TENANT sees only their own.
 *
 * The two branches use different data functions rather than one function with
 * an optional userId: getUserVisaSteps() filters by userId and is the
 * enforcement boundary for a client's own page, while getTenantVisaOverview()
 * deliberately returns every client. Collapsing them into one function whose
 * scope depends on an argument is how a page ends up leaking by passing
 * undefined.
 */
export default async function VisaPage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === Role.ADMIN;

  const [notifications, journeys, visaSteps] = await Promise.all([
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
    currentUser && isAdmin ? getTenantVisaOverview(currentUser.tenantId) : Promise.resolve([]),
    currentUser && !isAdmin
      ? getUserVisaSteps(currentUser.tenantId, currentUser.userId)
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="visa" client={{ property: currentUser?.email ?? "" }} isAdmin={isAdmin} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Golden Visa"
          subtitle={
            isAdmin ? "Every client's residency application." : "Your residency application progress."
          }
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {isAdmin ? (
            <AdminVisaOverview journeys={journeys} />
          ) : visaSteps.length === 0 ? (
            <p className="text-sm text-stone-500">No Golden Visa application steps are on record for your account yet.</p>
          ) : (
            <VisaTimeline steps={visaSteps} />
          )}
        </main>
      </div>
    </div>
  );
}
