import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { PropertyAssetCard } from "@/components/ui/PropertyAssetCard";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { getOwnedProperty } from "@/lib/data/propertyOwnership";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default async function PropertyPage() {
  const { getToken } = await auth();
  // Fetched through Supabase PostgREST (RLS-enforced), not Prisma — see
  // ARCHITECTURE.md's "Clerk ↔ Supabase Third-Party Auth" section.
  const [token, tenantId] = await Promise.all([getToken(), getCurrentTenantId()]);
  // Same "no synced users row yet" recoverable state as dashboard/projects/page.tsx.
  const ownedProperty = tenantId ? await getOwnedProperty(token, tenantId) : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="property" client={{ property: CURRENT_USER.property }} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="My Property"
          subtitle="Your unit at a glance."
          userName={CURRENT_USER.name}
          userInitials={CURRENT_USER.initials}
        />
        <main className="flex-1 bg-stone-50 p-8">
          {ownedProperty ? (
            <PropertyAssetCard property={ownedProperty} />
          ) : (
            <p className="text-sm text-stone-500">No property is currently assigned to your account.</p>
          )}
        </main>
      </div>
    </div>
  );
}
