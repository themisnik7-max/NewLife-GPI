import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { ApiKeyCard } from "@/components/ui/ApiKeyCard";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getTenantApiKeys } from "@/lib/data/apiKeys";
import { getOwnClientProfile } from "@/lib/data/clients";
import { getUserNotifications } from "@/lib/data/notifications";
import { formatDate } from "@/lib/format";
import { revokeApiKeyAction } from "./actions";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Role } from "@/lib/auth/role";

const displayDateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

// apiKeys.ts returns ISO date strings (matching data/projects.ts's
// convention); ApiKeyCard.tsx's own mock predates that and shows "3 May
// 2026"-style text, so real data is reformatted here at the page boundary
// rather than changing the data layer's convention or the component itself.
function formatDisplayDate(isoDate: string): string {
  return displayDateFormatter.format(new Date(isoDate));
}

/**
 * Renders one profile value, or an explicit "Not recorded" for a field the
 * advisor has not filled in. A blank cell reads as a rendering bug; naming
 * the absence tells the client there is nothing on file to correct.
 */
function ProfileItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className={value ? "text-stone-900" : "text-stone-400"}>{value || "Not recorded"}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();
  const [apiKeys, notifications, profile] = await Promise.all([
    currentUser ? getTenantApiKeys(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
    // getOwnClientProfile(), NOT getClientProfile(): the admin-only notes
    // field must never reach the person it describes, and this is the
    // function that guarantees it — RLS does not, because the app reads
    // through Prisma. See the comment on it in src/lib/data/clients.ts.
    currentUser ? getOwnClientProfile(currentUser.tenantId, currentUser.userId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeKey="profile"
        client={{ property: currentUser?.email ?? "" }}
        isAdmin={currentUser?.role === Role.ADMIN}
      />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Settings"
          subtitle="Manage your connected API keys."
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 space-y-4 bg-stone-50 p-8">
          {profile && (
            <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Your details</h2>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <ProfileItem label="Name" value={profile.name} />
                <ProfileItem label="Email" value={profile.email} />
                <ProfileItem label="Phone" value={profile.phone} />
                <ProfileItem label="Nationality" value={profile.nationality} />
                <ProfileItem label="Passport / ID" value={profile.passportNumber} />
                {/* Empty-string placeholder, not the default "—": ProfileItem
                    renders its own "Not recorded" for a falsy value, and
                    formatDate's dash would be truthy and win instead. */}
                <ProfileItem label="Date of birth" value={formatDate(profile.dateOfBirth, "")} />
              </dl>
              <p className="mt-4 text-xs text-stone-500">
                These details are maintained by your NewLife GPI advisor. Contact them to correct anything here.
              </p>
            </section>
          )}

          <h2 className="pt-2 text-xs font-semibold uppercase tracking-wide text-stone-500">API keys</h2>
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
