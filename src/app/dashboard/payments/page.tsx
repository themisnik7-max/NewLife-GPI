import { Sidebar } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { DelayPenalty } from "@/components/ui/DelayPenalty";

const CURRENT_USER = {
  initials: "MP",
  name: "Maria Papadopoulos",
  property: "Villa Elytra",
};

export default function PaymentsPage() {
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
        <main className="flex-1 bg-stone-50 p-8">
          <DelayPenalty isDelayed penaltyAmount={1250} />
        </main>
      </div>
    </div>
  );
}
