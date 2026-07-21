import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ApiKeyCard } from "@/components/ui/ApiKeyCard";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { getTenantApiKeys } from "@/lib/data/apiKeys";
import { revokeApiKeyAction } from "./actions";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

const displayDateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

// apiKeys.ts returns ISO date strings (matching data/projects.ts's
// convention); ApiKeyCard.tsx's own mock predates that and shows "3 May
// 2026"-style text, so real data is reformatted here at the page boundary
// rather than changing the data layer's convention or the component itself.
function formatDisplayDate(isoDate: string): string {
  return displayDateFormatter.format(new Date(isoDate));
}

export default async function SettingsPage() {
  const { userId } = await auth();
  const tenantId = await getCurrentTenantId();
  const apiKeys = tenantId && userId ? await getTenantApiKeys(tenantId, userId) : [];

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
        <main className="flex-1 space-y-4 bg-stone-50 p-8">
          {apiKeys.length === 0 ? (
            <p className="text-sm text-stone-500">No API keys have been added for your account yet.</p>
          ) : (
            apiKeys.map((apiKey) => (
              <ApiKeyCard
                key={apiKey.id}
                apiKey={{
                  ...apiKey,
                  createdAt: formatDisplayDate(apiKey.createdAt),
                  lastUsedAt: apiKey.lastUsedAt ? formatDisplayDate(apiKey.lastUsedAt) : null,
                }}
                onRevoke={revokeApiKeyAction}
              />
            ))
          )}
        </main>
      </div>
    </div>
  );
}
