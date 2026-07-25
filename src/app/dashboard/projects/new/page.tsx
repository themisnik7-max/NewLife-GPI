import { notFound } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { PropertyFormClient } from "./PropertyFormClient";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

/**
 * Admin-only: create a new Property in the tenant's catalog. Same access
 * gate pattern as src/app/dashboard/clients/[userId]/page.tsx.
 */
export default async function NewPropertyPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== Role.ADMIN) {
    notFound();
  }

  const notifications = await getUserNotifications(currentUser.tenantId, currentUser.userId);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="projects" client={{ property: currentUser.email }} isAdmin />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Add Property"
          subtitle="Create a new listing in the catalog."
          userName={currentUser.name}
          userInitials={currentUser.initials}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 space-y-4 bg-stone-50 p-8">
          <Link href="/dashboard/projects" className="text-sm font-semibold text-aegean-600 hover:underline">
            &larr; Back to all projects
          </Link>
          <PropertyFormClient />
        </main>
      </div>
    </div>
  );
}
