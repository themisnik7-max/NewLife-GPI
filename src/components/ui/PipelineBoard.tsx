"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, CalendarDays, Plus, Trash2, TrendingUp, UserCheck } from "lucide-react";
import {
  DEAL_STAGES,
  OPEN_DEAL_STAGES,
  buildStageColumns,
  calculateForecast,
  positionForIndex,
  type ContactView,
  type DealStageKey,
  type DealView,
} from "@/lib/pipeline";
import { formatCurrency } from "@/lib/format";
import { AdminError, ADMIN_FIELD_CLASS, useAdminAction } from "@/components/ui/adminControls";
import { createDealAction, deleteDealAction, moveDealAction } from "@/app/dashboard/pipeline/actions";

/**
 * The Kanban pipeline — drag a card between stages to advance a deal.
 *
 * Drag and drop uses the native HTML5 drag events rather than a library:
 * CLAUDE.md fixes the stack, adding one would need approval, and a
 * single-item board drag is the case native DnD handles well.
 *
 * The optimistic move is the important behaviour here. A drag that waits for
 * a server round trip before the card moves feels broken, so the card is
 * repositioned locally first and the server is told afterwards; a rejected
 * move restores the previous state and surfaces the error. `router.refresh()`
 * then reconciles with whatever the server actually holds, which also
 * corrects the board if another admin moved something concurrently.
 */

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export interface PipelineBoardProps {
  deals: DealView[];
  contacts: ContactView[];
  properties: { id: string; name: string }[];
}

export function PipelineBoard({ deals, contacts, properties }: PipelineBoardProps) {
  const router = useRouter();
  const { error, isPending, run } = useAdminAction();
  const [localDeals, setLocalDeals] = useState(deals);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<DealStageKey | null>(null);
  const [composingIn, setComposingIn] = useState<DealStageKey | null>(null);

  // `deals` is the server's truth; when it changes (a refresh landed, or
  // another admin moved a card) the local copy is replaced. Tracking the
  // previous prop rather than using an effect keeps the reconciliation
  // synchronous, so there is never a frame showing stale positions.
  const [lastServerDeals, setLastServerDeals] = useState(deals);
  if (deals !== lastServerDeals) {
    setLastServerDeals(deals);
    setLocalDeals(deals);
  }

  const columns = buildStageColumns(localDeals);
  const forecast = calculateForecast(localDeals);

  function handleDrop(event: DragEvent<HTMLDivElement>, stage: DealStageKey): void {
    event.preventDefault();
    setDragOverStage(null);

    const dealId = event.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!dealId) return;

    const deal = localDeals.find((candidate) => candidate.id === dealId);
    if (!deal) return;
    if (deal.stage === stage) return;

    // Siblings deliberately exclude the card being moved — otherwise it could
    // become its own neighbour and compute a midpoint against itself.
    const siblings = localDeals
      .filter((candidate) => candidate.stage === stage && candidate.id !== dealId)
      .sort((a, b) => a.position - b.position);
    const position = positionForIndex(siblings, siblings.length);

    const previous = localDeals;
    setLocalDeals((current) =>
      current.map((candidate) =>
        candidate.id === dealId ? { ...candidate, stage, position } : candidate,
      ),
    );

    run(
      async () => {
        try {
          await moveDealAction(dealId, stage, position);
        } catch (err) {
          // Put the board back before re-throwing: useAdminAction turns the
          // rejection into an inline message, but the card would otherwise
          // sit in a column the server never accepted.
          setLocalDeals(previous);
          throw err;
        }
      },
      () => router.refresh(),
    );
  }

  function handleCreate(event: FormEvent<HTMLFormElement>, stage: DealStageKey): void {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    run(
      () =>
        createDealAction({
          contactId: String(formData.get("contactId") ?? ""),
          title: String(formData.get("title") ?? ""),
          stage,
          value: String(formData.get("value") ?? "") || null,
          propertyId: String(formData.get("propertyId") ?? "") || null,
          expectedCloseDate: String(formData.get("expectedCloseDate") ?? "") || null,
        }),
      () => {
        form.reset();
        setComposingIn(null);
        router.refresh();
      },
    );
  }

  function handleDelete(deal: DealView): void {
    if (!window.confirm(`Delete the deal "${deal.title}"? This cannot be undone.`)) return;
    run(() => deleteDealAction(deal.id), () => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ForecastTile
          label="Open pipeline"
          value={formatCurrency(forecast.openValue)}
          hint={`${forecast.openCount} open deal${forecast.openCount === 1 ? "" : "s"}`}
          caveat={
            forecast.missingValueCount > 0
              ? `${forecast.missingValueCount} with no value recorded`
              : null
          }
        />
        <ForecastTile
          label="Weighted forecast"
          value={formatCurrency(Math.round(forecast.weightedValue))}
          hint="Value × stage probability"
          // Said out loud because "€412,000 weighted" reads as a measurement
          // and is not one — the probabilities are defaults, not history.
          caveat="Based on default stage probabilities, not closed-deal history"
        />
        <ForecastTile
          label="Won"
          value={formatCurrency(forecast.wonValue)}
          hint={`${forecast.wonCount} deal${forecast.wonCount === 1 ? "" : "s"} closed`}
          caveat={null}
        />
        <ForecastTile
          label="Lost"
          value={String(forecast.lostCount)}
          hint="Deals that did not close"
          caveat={null}
        />
      </section>

      <AdminError message={error} />

      {contacts.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Add a contact first — a deal always belongs to someone.
        </p>
      )}

      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((column) => {
          const stageKey = column.stage.key;
          const isDropTarget = dragOverStage === stageKey;

          return (
            <div
              key={stageKey}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverStage(stageKey);
              }}
              onDragLeave={() => setDragOverStage((current) => (current === stageKey ? null : current))}
              onDrop={(event) => handleDrop(event, stageKey)}
              className={`flex w-72 shrink-0 flex-col rounded-lg border p-2.5 transition-colors ${
                isDropTarget ? "border-aegean-400 bg-aegean-50" : "border-stone-200 bg-stone-100/60"
              }`}
            >
              <div className="flex items-baseline justify-between px-1 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-600">
                  {column.stage.label}
                  <span className="ml-1.5 rounded-full bg-stone-200 px-1.5 py-0.5 text-[11px] text-stone-700">
                    {column.deals.length}
                  </span>
                </h3>
                <span className="text-xs tabular-nums text-stone-500">
                  {formatCurrency(column.total)}
                  {column.missingValueCount > 0 && (
                    <span
                      className="ml-1 text-stone-400"
                      title={`${column.missingValueCount} deal(s) here have no value recorded`}
                    >
                      +{column.missingValueCount}?
                    </span>
                  )}
                </span>
              </div>

              <ul className="flex flex-col gap-2">
                {column.deals.map((deal) => (
                  <li key={deal.id}>
                    <article
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", deal.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingId(deal.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      className={`cursor-grab rounded-md border border-stone-200 bg-stone-0 p-2.5 shadow-sm transition-opacity active:cursor-grabbing ${
                        draggingId === deal.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-stone-900">{deal.title}</p>
                        <button
                          type="button"
                          onClick={() => handleDelete(deal)}
                          disabled={isPending}
                          aria-label={`Delete deal: ${deal.title}`}
                          className="shrink-0 rounded p-0.5 text-stone-300 transition-colors hover:bg-coral-100 hover:text-coral-700 disabled:opacity-60"
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </div>

                      <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-600">
                        {/* A contact who has become a client links through to
                        their full record; one who has not has no page yet. */}
                        {deal.contactClerkUserId ? (
                          <Link
                            href={`/dashboard/clients/${deal.contactClerkUserId}`}
                            className="inline-flex items-center gap-1 hover:text-aegean-700 hover:underline"
                          >
                            <UserCheck size={11} aria-hidden="true" />
                            {deal.contactName}
                          </Link>
                        ) : (
                          deal.contactName
                        )}
                      </p>

                      {deal.propertyName && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
                          <Building2 size={11} aria-hidden="true" />
                          {deal.propertyName}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-sm font-semibold tabular-nums text-stone-900">
                          {/* An unpriced deal says so rather than showing €0,
                          which would read as "worth nothing". */}
                          {deal.value === null ? (
                            <span className="text-xs font-normal text-stone-400">No value set</span>
                          ) : (
                            formatCurrency(deal.value)
                          )}
                        </span>
                        {deal.expectedCloseDate && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                            <CalendarDays size={10} aria-hidden="true" />
                            {dateFormatter.format(new Date(deal.expectedCloseDate))}
                          </span>
                        )}
                      </div>
                    </article>
                  </li>
                ))}
              </ul>

              {composingIn === stageKey ? (
                <form
                  onSubmit={(event) => handleCreate(event, stageKey)}
                  className="mt-2 flex flex-col gap-2 rounded-md border border-stone-200 bg-stone-0 p-2.5"
                >
                  <input
                    type="text"
                    name="title"
                    required
                    placeholder="Deal title"
                    aria-label="Deal title"
                    autoFocus
                    className={ADMIN_FIELD_CLASS}
                  />
                  <select name="contactId" required aria-label="Contact" className={ADMIN_FIELD_CLASS}>
                    <option value="">Choose a contact…</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.fullName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    name="value"
                    min="0"
                    step="1000"
                    placeholder="Value (optional)"
                    aria-label="Deal value"
                    className={ADMIN_FIELD_CLASS}
                  />
                  <select name="propertyId" aria-label="Property" className={ADMIN_FIELD_CLASS}>
                    <option value="">No property yet</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    name="expectedCloseDate"
                    aria-label="Expected close date"
                    className={ADMIN_FIELD_CLASS}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="rounded-md bg-aegean-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-aegean-700 disabled:opacity-60"
                    >
                      Add deal
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposingIn(null)}
                      className="text-xs text-stone-500 hover:text-stone-800"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setComposingIn(stageKey)}
                  disabled={contacts.length === 0}
                  className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={13} aria-hidden="true" />
                  Add deal
                </button>
              )}
            </div>
          );
        })}
      </div>

      <ClosedSummary deals={localDeals} />
    </div>
  );
}

function ForecastTile({
  label,
  value,
  hint,
  caveat,
}: {
  label: string;
  value: string;
  hint: string;
  caveat: string | null;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-0 p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
        <TrendingUp size={12} aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-stone-900">{value}</p>
      <p className="mt-0.5 text-xs text-stone-500">{hint}</p>
      {caveat && <p className="mt-1 text-[11px] text-amber-700">{caveat}</p>}
    </div>
  );
}

/**
 * Won and lost deals, listed rather than shown as board columns.
 *
 * They are terminal: a Won column would grow forever and push the live stages
 * off-screen, which is the opposite of what a board is for. Keeping them
 * visible but out of the way means a deal can still be dragged back if it was
 * closed by mistake — via the record, not the board.
 */
function ClosedSummary({ deals }: { deals: DealView[] }) {
  const closed = deals.filter((deal) => deal.stage === "WON" || deal.stage === "LOST");
  if (closed.length === 0) return null;

  const stageLabels = new Map(DEAL_STAGES.map((stage) => [stage.key, stage.label]));

  return (
    <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        Closed
        <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
          {closed.length}
        </span>
      </h3>
      <ul className="mt-3 flex flex-col divide-y divide-stone-100">
        {closed.map((deal) => (
          <li key={deal.id} className="flex flex-wrap items-center gap-3 py-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                deal.stage === "WON" ? "bg-green-50 text-green-700" : "bg-stone-100 text-stone-500"
              }`}
            >
              {stageLabels.get(deal.stage)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-stone-900">{deal.title}</span>
            <span className="truncate text-xs text-stone-500">{deal.contactName}</span>
            {deal.lostReason && (
              <span className="truncate text-xs text-stone-400">{deal.lostReason}</span>
            )}
            <span className="tabular-nums text-sm text-stone-700">
              {deal.value === null ? "—" : formatCurrency(deal.value)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { OPEN_DEAL_STAGES };
