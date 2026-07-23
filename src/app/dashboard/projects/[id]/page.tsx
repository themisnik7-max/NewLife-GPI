import { notFound } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ProjectDetail } from "@/components/ui/ProjectDetail";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getProjectById } from "@/lib/data/projects";
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
  const [project, notifications] = await Promise.all([
    currentUser ? getProjectById(params.id, currentUser.tenantId) : Promise.resolve(null),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeKey="projects"
        client={{ property: currentUser?.email ?? "" }}
        isAdmin={currentUser?.role === Role.ADMIN}
      />
      <div className="flex flex-1 flex-col">
        <TopNav
          title={project.name}
          subtitle={project.area}
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 bg-stone-50 p-8">
          <ProjectDetail project={project} />
        </main>
      </div>
    </div>
  );
}
