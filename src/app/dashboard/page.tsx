import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ClientTable } from "@/components/ui/ClientTable";
import { ClientOverviewSummary } from "@/components/ui/ClientOverviewSummary";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserNotifications } from "@/lib/data/notifications";
import { getTenantClients } from "@/lib/data/clients";
import { getClientPropertySnapshot } from "@/lib/data/propertyOwnership";
import { getPropertyMilestones } from "@/lib/data/construction";
import { getUserVisaSteps } from "@/lib/data/visa";
import { getUserLedger } from "@/lib/data/ledgers";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

/**
 * Overview shows a genuinely different screen per role, per the actual
 * product requirement — not two variations of the same layout:
 *   - ADMIN: a table of every client in the tenant (ClientTable, wired to
 *     real data), each row linking to that client's own detail page.
 *   - TENANT: the same ClientOverviewSummary aggregate an admin sees when
 *     drilling into a specific client (src/app/dashboard/clients/[userId]),
 *     just fed the signed-in user's own data.
 * Both branches were previously a single hardcoded ClientTable with mock
 * data and no role check at all.
 */
export default async function DashboardPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <p className="text-sm text-stone-500">Your account is not yet synced. Please try again shortly.</p>
      </div>
    );
  }

  const notifications = await getUserNotifications(currentUser.tenantId, currentUser.userId);
  const isAdmin = currentUser.role === Role.ADMIN;

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="overview" client={{ property: currentUser.email }} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title={isAdmin ? "Clients" : "Overview"}
          subtitle={isAdmin ? "All active NewLife GPI clients." : "Here's where things stand today."}
          userName={currentUser.name}
          userInitials={currentUser.initials}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {isAdmin ? <AdminClientList tenantId={currentUser.tenantId} /> : <OwnOverview tenantId={currentUser.tenantId} userId={currentUser.userId} />}
        </main>
      </div>
    </div>
  );
}

async function AdminClientList({ tenantId }: { tenantId: string }) {
  const clients = await getTenantClients(tenantId);
  return <ClientTable clients={clients} />;
}

async function OwnOverview({ tenantId, userId }: { tenantId: string; userId: string }) {
  const { property, rentalStage } = await getClientPropertySnapshot(tenantId, userId);
  const [milestones, visaSteps, ledgerEntries] = await Promise.all([
    property ? getPropertyMilestones(tenantId, property.id) : Promise.resolve([]),
    getUserVisaSteps(tenantId, userId),
    getUserLedger(tenantId, userId),
  ]);

  return (
    <ClientOverviewSummary
      property={property}
      rentalStage={rentalStage}
      milestones={milestones}
      visaSteps={visaSteps}
      ledgerEntries={ledgerEntries}
    />
  );
}
