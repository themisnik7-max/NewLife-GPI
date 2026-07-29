import Link from "next/link";
import { Plus } from "lucide-react";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ProjectsExplorer } from "@/components/ui/ProjectsExplorer";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getActiveProjects } from "@/lib/data/projects";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

export default async function ProjectsPage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === Role.ADMIN;
  // No matching `public.users` row yet (e.g. the Clerk webhook hasn't synced
  // this account) — show an empty catalog rather than throw, since this is
  // an expected, recoverable state, not a bug.
  const [projects, notifications] = await Promise.all([
    currentUser ? getActiveProjects(currentUser.tenantId) : Promise.resolve([]),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="projects" client={{ property: currentUser?.email ?? "" }} isAdmin={isAdmin} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Available Projects"
          subtitle="Browse other NewLife GPI developments."
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
          isAdmin={isAdmin}
        />
        <main className="flex-1 space-y-4 bg-stone-50 p-8">
          {isAdmin && (
            <div className="flex justify-end">
              <Link
                href="/dashboard/projects/new"
                className="inline-flex items-center gap-1.5 rounded-md bg-aegean-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-aegean-700"
              >
                <Plus size={14} aria-hidden="true" />
                Add Property
              </Link>
            </div>
          )}
          <ProjectsExplorer projects={projects} />
        </main>
      </div>
    </div>
  );
}
