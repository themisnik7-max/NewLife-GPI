import { AlertTriangle, CheckCircle2 } from "lucide-react";

export interface DelayPenaltyProps {
  isDelayed: boolean;
  penaltyAmount: number;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
});

export function DelayPenalty({ isDelayed, penaltyAmount }: DelayPenaltyProps) {
  if (isDelayed) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700"
      >
        <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <div className="font-semibold">Delivery delay penalty applies</div>
          <div className="mt-1 text-sm">
            A penalty of{" "}
            <span className="font-semibold">{currencyFormatter.format(penaltyAmount)}</span> has
            been assessed for this delay.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700"
    >
      <CheckCircle2 size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>
        <div className="font-semibold">On schedule</div>
        <div className="mt-1 text-sm">No delivery delay penalty applies. Everything is on track.</div>
      </div>
    </div>
  );
}
