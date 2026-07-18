import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ApiKeyCard } from "@/components/ui/ApiKeyCard";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="profile" client={CURRENT_USER} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Settings"
          subtitle="Manage your connected API keys."
          userName={CURRENT_USER.name}
          userInitials={CURRENT_USER.initials}
        />
        <main className="flex-1 bg-stone-50 p-8">
          <ApiKeyCard />
        </main>
      </div>
    </div>
  );
}
