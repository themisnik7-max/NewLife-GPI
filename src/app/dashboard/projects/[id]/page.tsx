import { notFound } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ProjectDetail } from "@/components/ui/ProjectDetail";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { getProjectById } from "@/lib/data/projects";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

// No generateStaticParams here anymore: the previous mock-data version could
// statically pre-render every id because the same 5 projects were shown to
// everyone regardless of who was signed in. Now that data is genuinely
// tenant-scoped and requires an authenticated request to resolve, there is
// no meaningful "every possible id" to enumerate at build time — this route
// is fully dynamic (server-rendered per request) instead.

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const tenantId = await getCurrentTenantId();
  const project = tenantId ? await getProjectById(params.id, tenantId) : null;

  if (!project) {
    notFound();
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="projects" client={{ property: CURRENT_USER.property }} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title={project.name}
          subtitle={project.area}
          userName={CURRENT_USER.name}
          userInitials={CURRENT_USER.initials}
        />
        <main className="flex-1 bg-stone-50 p-8">
          <ProjectDetail project={project} />
        </main>
      </div>
    </div>
  );
}
