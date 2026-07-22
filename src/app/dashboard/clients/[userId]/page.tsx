import { notFound } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ClientOverviewSummary } from "@/components/ui/ClientOverviewSummary";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserNotifications } from "@/lib/data/notifications";
import { getClientPropertySnapshot } from "@/lib/data/propertyOwnership";
import { getPropertyMilestones } from "@/lib/data/construction";
import { getUserVisaSteps } from "@/lib/data/visa";
import { getUserLedger } from "@/lib/data/ledgers";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/auth/role";

interface ClientDetailPageProps {
  params: { userId: string };
}

/**
 * Admin-only drill-down into a single client's data — the destination of
 * ClientTable's "View" link on Overview's admin branch
 * (src/app/dashboard/page.tsx). Renders the exact same ClientOverviewSummary
 * component a client sees on their own Overview, just fed this OTHER user's
 * data instead of the caller's own — which is why every fetch below goes
 * through the Prisma-path, admin-capable functions (getClientPropertySnapshot,
 * not getOwnedProperty) rather than the Supabase/RLS path, which has no way
 * to represent "an admin looking at someone else's data" at all.
 */
export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== Role.ADMIN) {
    notFound();
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: params.userId, tenantId: currentUser.tenantId },
  });
  if (!targetUser) {
    notFound();
  }

  const [{ property, rentalStage }, visaSteps, ledgerEntries, notifications] = await Promise.all([
    getClientPropertySnapshot(currentUser.tenantId, targetUser.id),
    getUserVisaSteps(currentUser.tenantId, targetUser.id),
    getUserLedger(currentUser.tenantId, targetUser.id),
    getUserNotifications(currentUser.tenantId, currentUser.userId),
  ]);
  const milestones = property ? await getPropertyMilestones(currentUser.tenantId, property.id) : [];

  const displayName = [targetUser.firstName, targetUser.lastName].filter(Boolean).join(" ") || targetUser.email;

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="overview" client={{ property: currentUser.email }} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title={displayName}
          subtitle={targetUser.email}
          userName={currentUser.name}
          userInitials={currentUser.initials}
          notifications={notifications}
        />
        <main className="flex-1 space-y-4 bg-stone-50 p-8">
          <Link href="/dashboard" className="text-sm font-semibold text-aegean-600 hover:underline">
            &larr; Back to all clients
          </Link>
          <ClientOverviewSummary
            property={property}
            rentalStage={rentalStage}
            milestones={milestones}
            visaSteps={visaSteps}
            ledgerEntries={ledgerEntries}
          />
        </main>
      </div>
    </div>
  );
}
