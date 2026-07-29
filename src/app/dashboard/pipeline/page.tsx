import { notFound } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { PipelineBoard } from "@/components/ui/PipelineBoard";
import { ContactsPanel } from "./ContactsPanel";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserNotifications } from "@/lib/data/notifications";
import { getContacts, getDeals } from "@/lib/data/pipeline";
import { getActiveProjects } from "@/lib/data/projects";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

/**
 * The pre-sale pipeline — the half of the CRM this application did not have.
 *
 * ADMIN-ONLY, with notFound() rather than a redirect or an "access denied"
 * screen, matching /dashboard/clients: a 404 does not confirm the route
 * exists to someone who should not know it does.
 *
 * There is no tenant branch on this page at all, unlike /dashboard/property
 * or /dashboard/visa which render a different screen per role. That is
 * deliberate and permanent: a prospect has no account to sign in with, and a
 * signed-up client has no business reading the pipeline they were once a lead
 * in — its notes, its lost reasons, and what the business privately thought
 * their deal was worth. See the module note in src/lib/data/pipeline.ts.
 */
export default async function PipelinePage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== Role.ADMIN) {
    notFound();
  }

  const [deals, contacts, notifications, projects] = await Promise.all([
    getDeals(currentUser.tenantId),
    getContacts(currentUser.tenantId),
    getUserNotifications(currentUser.tenantId, currentUser.userId),
    // Reused rather than adding a pipeline-specific property reader: the deal
    // form needs exactly "every property in this tenant, by name", which this
    // already returns for the assignment picker on the client detail page.
    getActiveProjects(currentUser.tenantId),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="pipeline" client={{ property: currentUser.email }} isAdmin />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Pipeline"
          subtitle="Every prospect and open deal, from first contact to signed contract."
          userName={currentUser.name}
          userInitials={currentUser.initials}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
          isAdmin
        />
        <main className="flex-1 space-y-6 bg-stone-50 p-8">
          <PipelineBoard
            deals={deals}
            contacts={contacts}
            properties={projects.map((project) => ({ id: project.id, name: project.name }))}
          />
          <ContactsPanel contacts={contacts} />
        </main>
      </div>
    </div>
  );
}
