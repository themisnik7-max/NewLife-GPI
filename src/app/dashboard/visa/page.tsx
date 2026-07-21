import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { VisaTimeline } from "@/components/ui/VisaTimeline";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { getUserVisaSteps } from "@/lib/data/visa";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default async function VisaPage() {
  const { userId } = await auth();
  const tenantId = await getCurrentTenantId();
  // getUserVisaSteps() is the Prisma path — no token needed, just tenantId +
  // userId, the same shape as dashboard/payments's getUserLedger() call.
  const visaSteps = tenantId && userId ? await getUserVisaSteps(tenantId, userId) : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="visa" client={{ property: CURRENT_USER.property }} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Golden Visa"
          subtitle="Your residency application progress."
          userName={CURRENT_USER.name}
          userInitials={CURRENT_USER.initials}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {visaSteps.length === 0 ? (
            <p className="text-sm text-stone-500">No Golden Visa application steps are on record for your account yet.</p>
          ) : (
            <VisaTimeline steps={visaSteps} />
          )}
        </main>
      </div>
    </div>
  );
}
