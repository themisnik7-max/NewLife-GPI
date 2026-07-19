import { notFound } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ProjectDetail } from "@/components/ui/ProjectDetail";
import { MOCK_PROJECTS } from "@/lib/projects";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export function generateStaticParams() {
  return MOCK_PROJECTS.map((project) => ({ id: project.id }));
}

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const project = MOCK_PROJECTS.find((candidate) => candidate.id === params.id);

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
