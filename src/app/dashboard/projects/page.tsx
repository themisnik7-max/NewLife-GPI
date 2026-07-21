import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ProjectsExplorer } from "@/components/ui/ProjectsExplorer";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { getActiveProjects } from "@/lib/data/projects";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default async function ProjectsPage() {
  const tenantId = await getCurrentTenantId();
  // No matching `public.users` row yet (e.g. the Clerk webhook hasn't synced
  // this account) — show an empty catalog rather than throw, since this is
  // an expected, recoverable state, not a bug.
  const projects = tenantId ? await getActiveProjects(tenantId) : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="projects" client={{ property: CURRENT_USER.property }} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Available Projects"
          subtitle="Browse other NewLife GPI developments."
          userName={CURRENT_USER.name}
          userInitials={CURRENT_USER.initials}
        />
        <main className="flex-1 bg-stone-50 p-8">
          <ProjectsExplorer projects={projects} />
        </main>
      </div>
    </div>
  );
}
