import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { PropertyAssetCard } from "@/components/ui/PropertyAssetCard";
import { MOCK_OWNED_PROPERTY } from "@/lib/projects";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default function PropertyPage() {
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
          <PropertyAssetCard property={MOCK_OWNED_PROPERTY} />
        </main>
      </div>
    </div>
  );
}
