import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { RentalRoadmap } from "@/components/ui/RentalRoadmap";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default function RentalPage() {
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
          <RentalRoadmap />
        </main>
      </div>
    </div>
  );
}
