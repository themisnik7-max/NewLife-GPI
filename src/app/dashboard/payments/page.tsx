import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { DelayPenalty } from "@/components/ui/DelayPenalty";
import { getCurrentTenantId } from "@/lib/auth/currentTenant";
import { getUserLedger } from "@/lib/data/ledgers";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" });
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function PaymentsPage() {
  const { userId } = await auth();
  const tenantId = await getCurrentTenantId();
  // getUserLedger(), not getTenantLedger(): this page shows one client's own
  // installments, not every tenant member's — see ledgers.ts's own comment
  // on why those two functions exist separately.
  const ledgerEntries = tenantId && userId ? await getUserLedger(tenantId, userId) : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar activeKey="payments" client={{ property: CURRENT_USER.property }} />
      <div className="flex flex-1 flex-col">
        <TopNav
          title="Payments & Expenses"
          subtitle="Delivery schedule and penalty status."
          userName={CURRENT_USER.name}
          userInitials={CURRENT_USER.initials}
        />
        <main className="flex-1 space-y-4 bg-stone-50 p-8">
          {ledgerEntries.length === 0 ? (
            <p className="text-sm text-stone-500">No payment installments are on record for your account yet.</p>
          ) : (
            ledgerEntries.map((entry) => (
              <div key={entry.id}>
                <div className="mb-2 flex items-baseline justify-between text-sm text-stone-600">
                  <span>Due {dateFormatter.format(new Date(entry.dueDate))}</span>
                  <span className="font-semibold text-stone-900">{currencyFormatter.format(entry.amount)}</span>
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
