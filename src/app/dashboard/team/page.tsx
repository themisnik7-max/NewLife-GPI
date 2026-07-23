import { notFound } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { TeamOrganizationPanel } from "@/components/ui/TeamOrganizationPanel";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

/**
 * Admin-only: create (once) or manage the Clerk Organization backing this
 * tenant, so real clients can be invited by email instead of every account
 * needing manual DB provisioning. Same access-gate pattern as
 * src/app/dashboard/clients/[userId]/page.tsx.
 */
export default async function TeamPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== Role.ADMIN) {
    notFound();
  }

  const notifications = await getUserNotifications(currentUser.tenantId, currentUser.userId);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="team" client={{ property: currentUser.email }} isAdmin />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Team"
          subtitle="Manage your organization and invite clients."
          userName={currentUser.name}
          userInitials={currentUser.initials}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 bg-stone-50 p-8">
          <TeamOrganizationPanel />
        </main>
      </div>
    </div>
  );
}
