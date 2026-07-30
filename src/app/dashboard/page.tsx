import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { MetricsDashboard } from "@/components/ui/MetricsDashboard";
import { ClientOverviewSummary } from "@/components/ui/ClientOverviewSummary";
import { OpenTasksPanel } from "@/components/ui/OpenTasksPanel";
import { InsightPanel } from "@/components/ui/InsightPanel";
import { getOpenTasks } from "@/lib/data/activities";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserNotifications } from "@/lib/data/notifications";
import { getTenantMetrics } from "@/lib/data/metrics";
import { getClientPropertySnapshot } from "@/lib/data/propertyOwnership";
import { getClientRentalStages } from "@/lib/data/rentalStages";
import { getPropertyMilestones } from "@/lib/data/construction";
import { getUserVisaSteps } from "@/lib/data/visa";
import { getUserLedger } from "@/lib/data/ledgers";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

/**
 * Overview shows a genuinely different screen per role:
 *   - ADMIN: a business-wide snapshot (MetricsDashboard) — clients,
 *     properties sold, money outstanding, workflow progress — with every
 *     card linking to the page that owns its detail.
 *   - TENANT: the same ClientOverviewSummary aggregate an admin sees when
 *     drilling into a specific client (src/app/dashboard/clients/[userId]),
 *     just fed the signed-in user's own data.
 *
 * The admin branch used to be the client roster. That moved to its own page
 * (/dashboard/clients) so Overview could become what a supervisor actually
 * opens first: the state of the business, not a list to scroll. The roster is
 * one click away, and the Clients card links straight to it.
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
      <Sidebar activeKey="overview" client={{ property: currentUser.email }} isAdmin={isAdmin} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Overview"
          subtitle={isAdmin ? "The whole business at a glance." : "Here's where things stand today."}
          userName={currentUser.name}
          userInitials={currentUser.initials}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
          isAdmin={isAdmin}
        />
        <main className="flex-1 space-y-4 bg-stone-50 p-8">
          {/* "Invite Client" moved to /dashboard/clients along with the
              roster — it belongs next to the list it adds to, not on a
              summary screen. */}
          {isAdmin ? <AdminOverview tenantId={currentUser.tenantId} /> : <OwnOverview tenantId={currentUser.tenantId} userId={currentUser.userId} />}
        </main>
      </div>
    </div>
  );
}

async function AdminOverview({ tenantId }: { tenantId: string }) {
  // Tenant-wide, admin-only: "what needs doing across the business" is the
  // question this screen exists to answer, so getOpenTasks() takes no user
  // filter. A per-user variant would be its own function, per the
  // two-function rule — there is no task assignment column yet, so it does
  // not exist rather than being faked with the author's id.
  const [metrics, openTasks] = await Promise.all([getTenantMetrics(tenantId), getOpenTasks(tenantId)]);

  return (
    <div className="space-y-4">
      <MetricsDashboard metrics={metrics} />
      {/* Renders inert until the admin clicks Analyse — the AI call bills
      the tenant's own key, so it must be a deliberate act, not a page load. */}
      <InsightPanel mode="pipeline" />
      <OpenTasksPanel tasks={openTasks} />
    </div>
  );
}

async function OwnOverview({ tenantId, userId }: { tenantId: string; userId: string }) {
  const { property } = await getClientPropertySnapshot(tenantId, userId);
  const [milestones, visaSteps, ledgerEntries, rentalStages] = await Promise.all([
    property ? getPropertyMilestones(tenantId, property.id) : Promise.resolve([]),
    getUserVisaSteps(tenantId, userId),
    getUserLedger(tenantId, userId),
    getClientRentalStages(tenantId, userId),
  ]);

  return (
    <ClientOverviewSummary
      property={property}
      rentalStages={rentalStages}
      milestones={milestones}
      visaSteps={visaSteps}
      ledgerEntries={ledgerEntries}
    />
  );
}
