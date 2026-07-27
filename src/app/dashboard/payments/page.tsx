import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { DelayPenalty } from "@/components/ui/DelayPenalty";
import { AdminPaymentsTable } from "@/components/ui/AdminPaymentsTable";
import { getCurrentUser } from "@/lib/auth/currentTenant";
import { getUserLedger, getTenantPaymentsOverview } from "@/lib/data/ledgers";
import { getUserNotifications } from "@/lib/data/notifications";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { formatCurrency, formatDate } from "@/lib/format";
import { Role } from "@/lib/auth/role";

const EMPTY_OVERVIEW = {
  entries: [],
  totals: { billed: 0, collected: 0, outstanding: 0, overdueCount: 0 },
};

/**
 * ADMIN sees every installment in the tenant, pending and settled; TENANT
 * sees only their own.
 *
 * getUserLedger() for the client branch, never getTenantLedger() — see
 * ledgers.ts's own comment on why those functions exist separately, and why
 * using the tenant-wide one on a personal page would show every other
 * member's payment history.
 */
export default async function PaymentsPage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === Role.ADMIN;

  const [notifications, overview, ledgerEntries] = await Promise.all([
    currentUser ? getUserNotifications(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
    currentUser && isAdmin
      ? getTenantPaymentsOverview(currentUser.tenantId)
      : Promise.resolve(EMPTY_OVERVIEW),
    currentUser && !isAdmin ? getUserLedger(currentUser.tenantId, currentUser.userId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="payments" client={{ property: currentUser?.email ?? "" }} isAdmin={isAdmin} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title={isAdmin ? "Payments" : "Payments & Expenses"}
          subtitle={
            isAdmin ? "Every installment across all clients." : "Delivery schedule and penalty status."
          }
          userName={currentUser?.name ?? ""}
          userInitials={currentUser?.initials ?? ""}
          notifications={notifications}
          onMarkNotificationRead={markNotificationReadAction}
        />
        <main className="flex-1 space-y-4 bg-stone-50 p-8">
          {isAdmin ? (
            <AdminPaymentsTable overview={overview} />
          ) : ledgerEntries.length === 0 ? (
            <p className="text-sm text-stone-500">No payment installments are on record for your account yet.</p>
          ) : (
            ledgerEntries.map((entry) => (
              <div key={entry.id}>
                <div className="mb-2 flex items-baseline justify-between text-sm text-stone-600">
                  <span>Due {formatDate(entry.dueDate)}</span>
                  <span className="font-semibold text-stone-900">{formatCurrency(entry.amount)}</span>
                </div>
                <DelayPenalty isDelayed={entry.isDelayed} penaltyAmount={entry.penaltyAmount} />
              </div>
            ))
          )}
        </main>
      </div>
    </div>
  );
}
