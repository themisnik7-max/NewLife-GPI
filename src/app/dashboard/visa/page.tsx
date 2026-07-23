import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { VisaTimeline } from "@/components/ui/VisaTimeline";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserVisaSteps } from "@/lib/data/visa";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

export default async function VisaPage() {
  const currentUser = await getCurrentUser();
  // getUserVisaSteps() is the Prisma path — no token needed, just tenantId +
  // userId, the same shape as dashboard/payments's getUserLedger() call.
  const [visaSteps, notifications] = await Promise.all([
    currentUser ? getUserVisaSteps(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeKey="visa"
        client={{ property: currentUser?.email ?? "" }}
        isAdmin={currentUser?.role === Role.ADMIN}
      />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Golden Visa"
          subtitle="Your residency application progress."
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {visaSteps.length === 0 ? (
            <p className="text-sm text-stone-500">No Golden Visa application steps are on record for your account yet.</p>
          ) : (
            <VisaTimeline steps={visaSteps} />
          )}
        </main>
      </div>
    </div>
  );
}
