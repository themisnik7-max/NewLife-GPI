import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ClientTable } from "@/components/ui/ClientTable";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="overview" client={CURRENT_USER} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Clients"
          subtitle="All active NewLife GPI clients."
          userName={CURRENT_USER.name}
          userInitials={CURRENT_USER.initials}
          notificationCount={2}
        />
        <main className="flex-1 bg-stone-50 p-8">
          <ClientTable />
        </main>
      </div>
    </div>
  );
}
