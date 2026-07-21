import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { RentalRoadmap } from "@/components/ui/RentalRoadmap";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { getCurrentRentalStage } from "@/lib/data/propertyOwnership";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default async function RentalPage() {
  const { getToken } = await auth();
  const [token, tenantId] = await Promise.all([getToken(), getCurrentTenantId()]);
  const currentStage = tenantId ? await getCurrentRentalStage(token, tenantId) : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="rental" client={{ property: CURRENT_USER.property }} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Rental & Leasing"
          subtitle="Track your property's rental progress."
          userName={CURRENT_USER.name}
          userInitials={CURRENT_USER.initials}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {currentStage ? (
            <RentalRoadmap currentStage={currentStage} />
          ) : (
            <p className="text-sm text-stone-500">No rental progress is available for your account yet.</p>
          )}
        </main>
      </div>
    </div>
  );
}
