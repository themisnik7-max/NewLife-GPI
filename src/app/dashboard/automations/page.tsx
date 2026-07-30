import { notFound } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { AutomationsManager } from "./AutomationsManager";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserNotifications } from "@/lib/data/notifications";
import { getAutomationRules } from "@/lib/data/automations";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

/**
 * The automation recipes screen.
 *
 * ADMIN-ONLY with notFound(), matching /dashboard/clients and
 * /dashboard/pipeline: a 404 does not confirm the route exists to someone
 * who should not know it does. There is no tenant branch — a rule's message
 * template describes how the business chases its own clients, which is not
 * something a client has any business reading.
 */
export default async function AutomationsPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== Role.ADMIN) {
    notFound();
  }

  const [rules, notifications] = await Promise.all([
    getAutomationRules(currentUser.tenantId),
    getUserNotifications(currentUser.tenantId, currentUser.userId),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="automations" client={{ property: currentUser.email }} isAdmin />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Automations"
          subtitle="Be told when a deal stalls, a payment slips, or a workflow stops moving."
          userName={currentUser.name}
          userInitials={currentUser.initials}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
          isAdmin
        />
        <main className="flex-1 bg-stone-50 p-8">
          <AutomationsManager rules={rules} />
        </main>
      </div>
    </div>
  );
}
