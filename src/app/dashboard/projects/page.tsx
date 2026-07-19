import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ProjectsExplorer } from "@/components/ui/ProjectsExplorer";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default function ProjectsPage() {
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
          <ProjectsExplorer />
        </main>
      </div>
    </div>
  );
}
