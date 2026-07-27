import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ClientDirectory } from "@/components/ui/ClientDirectory";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserNotifications } from "@/lib/data/notifications";
import { getClientDirectory } from "@/lib/data/clients";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

/**
 * The admin client roster — every client profile in the tenant.
 *
 * Previously this list lived on Overview. It moved here so Overview could
 * become a business snapshot, and because a roster deserves its own route: it
 * is where an admin lands to find a specific person, and "/dashboard" is not
 * a URL anyone shares for that.
 *
 * notFound() rather than a redirect or an "access denied" screen for
 * non-admins, matching /dashboard/clients/[userId]: a 404 does not confirm
 * that the route exists to someone who should not know it does.
 */
export default async function ClientsPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== Role.ADMIN) {
    notFound();
  }

  const [clients, notifications] = await Promise.all([
    getClientDirectory(currentUser.tenantId),
    getUserNotifications(currentUser.tenantId, currentUser.userId),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="clients" client={{ property: currentUser.email }} isAdmin />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Clients"
          subtitle={`${clients.length} client${clients.length === 1 ? "" : "s"} across every workflow.`}
          userName={currentUser.name}
          userInitials={currentUser.initials}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 space-y-4 bg-stone-50 p-8">
          <div className="flex justify-end">
            {/* Links to the existing Clerk <OrganizationProfile /> invite flow
                rather than adding a second, parallel add-client mechanism —
                it was already built, just not reachable from where an admin
                looks for it. */}
            <Link
              href="/dashboard/team"
              className="inline-flex items-center gap-1.5 rounded-md bg-aegean-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-aegean-700"
            >
              <UserPlus size={14} aria-hidden="true" />
              Invite Client
            </Link>
          </div>
          <ClientDirectory clients={clients} />
        </main>
      </div>
    </div>
  );
}
