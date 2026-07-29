"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info, Sparkles, TriangleAlert } from "lucide-react";
import type { Signal, SignalSeverity } from "@/lib/ai/signals";
import { formatCost } from "@/lib/ai/models";
import { AdminError, useAdminAction } from "@/components/ui/adminControls";
import {
  generateClientBriefAction,
  generatePipelineMonitorAction,
} from "@/app/dashboard/insights/actions";

/**
 * The AI panel — deterministic findings, plus an optional written summary.
 *
 * ⚠️ THE TWO HALVES ARE VISUALLY DISTINCT ON PURPOSE. The signals are facts
 * the system computed from the database; the narrative is text a language
 * model wrote. Presenting them identically would invite the reader to trust
 * both equally, and only one of them is arithmetic. The narrative is
 * labelled as AI-generated and sits below the facts it describes, never
 * above them.
 *
 * Generated on demand rather than on mount: each run bills the tenant's own
 * API key, and a panel that spends money simply because someone opened a
 * page is a panel that gets switched off.
 */

const SEVERITY_STYLES: Record<SignalSeverity, { icon: typeof AlertTriangle; className: string }> = {
  critical: { icon: TriangleAlert, className: "bg-coral-100 text-coral-700" },
  warning: { icon: AlertTriangle, className: "bg-amber-50 text-amber-800" },
  info: { icon: Info, className: "bg-stone-100 text-stone-600" },
};

interface InsightResult {
  signals: Signal[];
  narrative: string | null;
  narrativeUnavailableReason: string | null;
  costUsd: number | null;
}

export interface InsightPanelProps {
  /** "pipeline" runs the tenant-wide monitor; "client" briefs one person. */
  mode: "pipeline" | "client";
  /** Required for mode="client" — the subject, not the caller. */
  userId?: string;
  title?: string;
}

export function InsightPanel({ mode, userId, title }: InsightPanelProps) {
  const { error, isPending, run } = useAdminAction();
  const [result, setResult] = useState<InsightResult | null>(null);

  const heading = title ?? (mode === "pipeline" ? "Pipeline monitor" : "Client brief");

  function handleGenerate(): void {
    run(async () => {
      const insight =
        mode === "pipeline"
          ? await generatePipelineMonitorAction()
          : await generateClientBriefAction(userId ?? "");
      setResult(insight);
    });
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          <Sparkles size={13} aria-hidden="true" />
          {heading}
        </h3>

        <div className="flex items-center gap-3">
          {result?.costUsd !== null && result?.costUsd !== undefined && (
            <span className="text-xs text-stone-400" title="Charged to your own API key">
              {formatCost(result.costUsd)}
            </span>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            className="rounded-md bg-aegean-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-aegean-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Analysing…" : result ? "Refresh" : "Analyse"}
          </button>
        </div>
      </header>

      <AdminError message={error} />

      {!result && !isPending && (
        <p className="mt-3 text-sm text-stone-500">
          {mode === "pipeline"
            ? "Check the pipeline for stalled deals, overdue payments, and outstanding tasks."
            : "Summarise where this client stands across property, payments, visa, and rental."}
        </p>
      )}

      {result && (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              Detected from your data
            </p>

            {result.signals.length === 0 ? (
              <p className="mt-1.5 text-sm text-stone-600">Nothing needs attention right now.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {result.signals.map((signal, index) => {
                  const { icon: Icon, className } = SEVERITY_STYLES[signal.severity];
                  return (
                    <li
                      key={`${signal.kind}-${index}`}
                      className="flex items-start gap-2 text-sm text-stone-700"
                    >
                      <span
                        className={`mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full p-1 ${className}`}
                      >
                        <Icon size={11} aria-hidden="true" />
                      </span>
                      <span className="flex-1">
                        {signal.message}
                        {signal.href && (
                          <>
                            {" "}
                            <Link
                              href={signal.href}
                              className="font-semibold text-aegean-600 hover:underline"
                            >
                              View
                            </Link>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Visually separated and explicitly labelled: the block above is
          arithmetic over the database, this one is generated prose. */}
          <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              AI summary
            </p>
            {result.narrative ? (
              <p className="mt-1.5 whitespace-pre-line text-sm text-stone-700">{result.narrative}</p>
            ) : (
              <p className="mt-1.5 text-sm text-stone-500">
                {result.narrativeUnavailableReason ?? "No summary was generated."}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
