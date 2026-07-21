import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ConstructionMilestones } from "@/components/ui/ConstructionMilestones";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { getOwnedProperty } from "@/lib/data/propertyOwnership";
import { getPropertyMilestones } from "@/lib/data/construction";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default async function ConstructionPage() {
  const { getToken } = await auth();
  // Same "resolve the owned property first" shape as dashboard/property and
  // dashboard/rental: getOwnedProperty() is the Supabase/RLS path (needs the
  // token), getPropertyMilestones() is the Prisma path (needs no token, just
  // the tenantId + the propertyId this first call resolves).
  const [token, tenantId] = await Promise.all([getToken(), getCurrentTenantId()]);
  const ownedProperty = tenantId ? await getOwnedProperty(token, tenantId) : null;
  const milestones = tenantId && ownedProperty ? await getPropertyMilestones(tenantId, ownedProperty.id) : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="construction" client={{ property: CURRENT_USER.property }} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Construction"
          subtitle="Track your property's build progress."
          userName={CURRENT_USER.name}
          userInitials={CURRENT_USER.initials}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {milestones.length === 0 ? (
            <p className="text-sm text-stone-500">No construction milestones are on record for your property yet.</p>
          ) : (
            <ConstructionMilestones milestones={milestones} />
          )}
        </main>
      </div>
    </div>
  );
}
