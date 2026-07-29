"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  CircleDot,
  Eye,
  EyeOff,
  Mail,
  MessageSquare,
  Phone,
  Settings2,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import {
  ACTIVITY_TYPES,
  isOverdueTask,
  type ActivityType,
  type ActivityView,
  type TimelineEntry,
} from "@/lib/activities";
import { AdminError, ADMIN_FIELD_CLASS, useAdminAction } from "@/components/ui/adminControls";
import {
  createActivityAction,
  deleteActivityAction,
  setTaskCompletionAction,
  updateActivityAction,
} from "@/app/dashboard/activities/actions";

/**
 * The record timeline — what people did, interleaved with what the system
 * recorded, in one feed.
 *
 * The merge is the point. monday keeps its activity log and its audit history
 * on separate screens; here "Called about the offer" sits directly above
 * "changed status from Pending to Done", so one column tells the whole story
 * of a record. System entries are visually quieter than human ones because
 * there are far more of them and they are context, not content.
 *
 * READ-ONLY BY DEFAULT. `canManage` gates the composer and every per-entry
 * control, and the server re-checks admin role on each action anyway.
 */

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const TYPE_ICONS: Record<ActivityType, typeof Phone> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Users,
  NOTE: MessageSquare,
  TASK: CalendarClock,
};

export interface ActivityTimelineProps {
  entries: TimelineEntry[];
  entityType: string;
  entityId: string;
  /** Admin-only: shows the composer and per-entry controls. */
  canManage?: boolean;
  title?: string;
}

export function ActivityTimeline({
  entries,
  entityType,
  entityId,
  canManage = false,
  title = "Activity",
}: ActivityTimelineProps) {
  const router = useRouter();
  const { error, isPending, run } = useAdminAction();
  const [type, setType] = useState<ActivityType>("NOTE");
  const [showSystem, setShowSystem] = useState(true);

  const isTask = type === "TASK";
  const visibleEntries = showSystem ? entries : entries.filter((entry) => entry.kind === "activity");
  const systemCount = entries.length - entries.filter((entry) => entry.kind === "activity").length;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    run(
      () =>
        createActivityAction({
          entityType,
          entityId,
          type,
          subject: String(formData.get("subject") ?? ""),
          body: String(formData.get("body") ?? "") || null,
          // A task carries a due date and no occurrence time; every other
          // type is the reverse. The data layer enforces this too — the form
          // simply never offers the wrong field.
          occurredAt: isTask ? null : String(formData.get("occurredAt") ?? "") || null,
          dueAt: isTask ? String(formData.get("dueAt") ?? "") || null : null,
          visibleToClient: formData.get("visibleToClient") === "on",
        }),
      () => {
        form.reset();
        setType("NOTE");
        router.refresh();
      },
    );
  }

  function handleToggleTask(activity: ActivityView): void {
    run(
      () =>
        setTaskCompletionAction(activity.id, entityType, entityId, !activity.completedAt),
      () => router.refresh(),
    );
  }

  function handleToggleVisibility(activity: ActivityView): void {
    run(
      () =>
        updateActivityAction(activity.id, entityType, entityId, {
          visibleToClient: !activity.visibleToClient,
        }),
      () => router.refresh(),
    );
  }

  function handleDelete(activity: ActivityView): void {
    if (!window.confirm(`Delete "${activity.subject}"? This cannot be undone.`)) return;
    run(() => deleteActivityAction(activity.id, entityType, entityId), () => router.refresh());
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h3>

        {systemCount > 0 && (
          <button
            type="button"
            onClick={() => setShowSystem((current) => !current)}
            aria-pressed={showSystem}
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
          >
            <Settings2 size={13} aria-hidden="true" />
            {showSystem ? "Hide system events" : `Show system events (${systemCount})`}
          </button>
        )}
      </header>

      <AdminError message={error} />

      {canManage && (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div
            role="radiogroup"
            aria-label="Activity type"
            className="flex flex-wrap gap-1 rounded-md border border-stone-200 p-1"
          >
            {ACTIVITY_TYPES.map((definition) => {
              const Icon = TYPE_ICONS[definition.key];
              const isSelected = definition.key === type;
              return (
                <button
                  key={definition.key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setType(definition.key)}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    isSelected
                      ? "bg-aegean-600 text-white"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                >
                  <Icon size={14} aria-hidden="true" />
                  {definition.label}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            name="subject"
            required
            placeholder={isTask ? "What needs doing?" : "What happened?"}
            className={ADMIN_FIELD_CLASS}
            aria-label="Subject"
          />

          <textarea
            name="body"
            rows={2}
            placeholder="Details (optional)"
            className={ADMIN_FIELD_CLASS}
            aria-label="Details"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {isTask ? (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-stone-700">Due</span>
                <input type="date" name="dueAt" required className={ADMIN_FIELD_CLASS} />
              </label>
            ) : (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-stone-700">When it happened</span>
                <input type="datetime-local" name="occurredAt" className={ADMIN_FIELD_CLASS} />
                <span className="text-xs text-stone-500">
                  Leave blank for now. Back-date it to log something from last week.
                </span>
              </label>
            )}

            <label className="flex items-start gap-2 self-end pb-1 text-sm text-stone-700">
              <input type="checkbox" name="visibleToClient" className="mt-0.5" />
              <span>
                Visible to the client
                <span className="block text-xs text-stone-500">
                  Off by default — internal notes stay internal.
                </span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="self-start rounded-md bg-aegean-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-aegean-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving…" : isTask ? "Add task" : "Log activity"}
          </button>
        </form>
      )}

      {visibleEntries.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-5 flex flex-col">
          {visibleEntries.map((entry, index) => {
            const isLast = index === visibleEntries.length - 1;

            if (entry.kind === "system") {
              return (
                <li key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-400">
                      <CircleDot size={11} aria-hidden="true" />
                    </span>
                    {!isLast && <span aria-hidden="true" className="w-px flex-1 bg-stone-200" />}
                  </div>
                  <div className="flex-1 pb-4 text-sm text-stone-500">
                    <span className="font-medium text-stone-600">{entry.actorName}</span>{" "}
                    {entry.summary}
                    <span className="ml-1.5 text-xs text-stone-400">
                      {dateTimeFormatter.format(new Date(entry.at))}
                    </span>
                  </div>
                </li>
              );
            }

            const activity = entry.activity;
            const Icon = TYPE_ICONS[activity.type];
            const isDone = Boolean(activity.completedAt);
            const overdue = isOverdueTask(activity);

            return (
              <li key={activity.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      overdue ? "bg-coral-100 text-coral-700" : "bg-aegean-50 text-aegean-700"
                    }`}
                  >
                    <Icon size={12} aria-hidden="true" />
                  </span>
                  {!isLast && <span aria-hidden="true" className="w-px flex-1 bg-stone-200" />}
                </div>

                <div className="flex-1 pb-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {activity.type === "TASK" && canManage && (
                      <button
                        type="button"
                        onClick={() => handleToggleTask(activity)}
                        disabled={isPending}
                        aria-label={
                          isDone ? `Reopen "${activity.subject}"` : `Complete "${activity.subject}"`
                        }
                        className="text-stone-400 transition-colors hover:text-green-600 disabled:opacity-60"
                      >
                        {isDone ? (
                          <Check size={15} className="text-green-600" aria-hidden="true" />
                        ) : (
                          <Square size={15} aria-hidden="true" />
                        )}
                      </button>
                    )}

                    <span
                      className={`text-sm font-medium ${
                        isDone ? "text-stone-400 line-through" : "text-stone-900"
                      }`}
                    >
                      {activity.subject}
                    </span>

                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                      {activity.typeLabel}
                    </span>

                    {overdue && (
                      <span className="rounded-full bg-coral-100 px-2 py-0.5 text-[11px] font-semibold text-coral-700">
                        Overdue
                      </span>
                    )}

                    {canManage && activity.visibleToClient && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                        <Eye size={11} aria-hidden="true" />
                        Shared
                      </span>
                    )}
                  </div>

                  {activity.body && (
                    <p className="mt-1 whitespace-pre-line text-sm text-stone-600">{activity.body}</p>
                  )}

                  <p className="mt-1 text-xs text-stone-400">
                    {activity.createdByName} ·{" "}
                    {activity.type === "TASK" && activity.dueAt
                      ? `Due ${dateFormatter.format(new Date(activity.dueAt))}`
                      : dateTimeFormatter.format(new Date(entry.at))}
                  </p>

                  {canManage && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(activity)}
                        disabled={isPending}
                        aria-label={
                          activity.visibleToClient
                            ? `Stop sharing "${activity.subject}" with the client`
                            : `Share "${activity.subject}" with the client`
                        }
                        className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:opacity-60"
                      >
                        {activity.visibleToClient ? (
                          <EyeOff size={13} aria-hidden="true" />
                        ) : (
                          <Eye size={13} aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(activity)}
                        disabled={isPending}
                        aria-label={`Delete "${activity.subject}"`}
                        className="rounded p-1 text-stone-400 transition-colors hover:bg-coral-100 hover:text-coral-700 disabled:opacity-60"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
