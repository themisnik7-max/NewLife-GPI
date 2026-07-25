import { notFound } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { PropertyDetailWithEdit } from "./PropertyDetailWithEdit";
import { MilestoneAdminPanel } from "./MilestoneAdminPanel";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getProjectById } from "@/lib/data/projects";
import { getPropertyMilestones } from "@/lib/data/construction";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

// No generateStaticParams here anymore: the previous mock-data version could
// statically pre-render every id because the same 5 projects were shown to
// everyone regardless of who was signed in. Now that data is genuinely
// tenant-scoped and requires an authenticated request to resolve, there is
// no meaningful "every possible id" to enumerate at build time — this route
// is fully dynamic (server-rendered per request) instead.

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === Role.ADMIN;
  const [project, notifications] = await Promise.all([
    currentUser ? getProjectById(params.id, currentUser.tenantId) : Promise.resolve(null),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);

  if (!project) {
    notFound();
  }

  // Milestones are only fetched for the admin panel — the client-facing view
  // of this page has never shown them (they live on /dashboard/construction),
  // so a non-admin visit shouldn't pay for the query at all.
  const milestones =
    isAdmin && currentUser ? await getPropertyMilestones(currentUser.tenantId, project.id) : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="projects" client={{ property: currentUser?.email ?? "" }} isAdmin={isAdmin} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title={project.name}
          subtitle={project.area}
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 space-y-6 bg-stone-50 p-8">
          <PropertyDetailWithEdit project={project} isAdmin={isAdmin} />
          {isAdmin && <MilestoneAdminPanel propertyId={project.id} milestones={milestones} />}
        </main>
      </div>
    </div>
  );
}
