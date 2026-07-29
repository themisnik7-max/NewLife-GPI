"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Play, Plus, Trash2, Zap } from "lucide-react";
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_TRIGGERS,
  TRIGGER_BY_KEY,
  SUBJECT_PLACEHOLDER,
  type RuleView,
} from "@/lib/automations";
import { AdminError, ADMIN_FIELD_CLASS, useAdminAction } from "@/components/ui/adminControls";
import type { RunResult } from "@/lib/data/automations";
import {
  createRuleAction,
  deleteRuleAction,
  runAutomationsAction,
  setRuleEnabledAction,
} from "./actions";

/**
 * The automation recipes screen — "when X, do Y", as monday's automations
 * are.
 *
 * The Run button is deliberately prominent. These rules are evaluated on
 * demand rather than firing on write (see the model comment on
 * AutomationRule for why), and an automation nobody has watched fire is an
 * automation nobody trusts — so running one and seeing exactly what it
 * matched is the primary interaction, not an afterthought.
 */

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export interface AutomationsManagerProps {
  rules: RuleView[];
}

export function AutomationsManager({ rules }: AutomationsManagerProps) {
  const router = useRouter();
  const { error, isPending, run } = useAdminAction();
  const [isAdding, setIsAdding] = useState(false);
  const [trigger, setTrigger] = useState(AUTOMATION_TRIGGERS[0].key as string);
  const [lastRun, setLastRun] = useState<RunResult[] | null>(null);

  const definition = TRIGGER_BY_KEY.get(trigger);
  const usesThreshold = definition?.usesThreshold ?? false;

  function handleCreate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    run(
      () =>
        createRuleAction({
          name: String(formData.get("name") ?? ""),
          trigger,
          // Sent empty for a trigger with no threshold, so a leftover value
          // from switching triggers cannot be stored against a rule that
          // ignores it.
          thresholdDays: usesThreshold ? String(formData.get("thresholdDays") ?? "") : "",
          action: String(formData.get("action") ?? ""),
          messageTemplate: String(formData.get("messageTemplate") ?? ""),
        }),
      () => {
        form.reset();
        setIsAdding(false);
        router.refresh();
      },
    );
  }

  function handleRun(): void {
    run(async () => {
      const results = await runAutomationsAction();
      setLastRun(results);
      router.refresh();
    });
  }

  function handleDelete(rule: RuleView): void {
    if (!window.confirm(`Delete the rule "${rule.name}"?`)) return;
    run(() => deleteRuleAction(rule.id), () => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            <Zap size={13} aria-hidden="true" />
            Rules
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
              {rules.length}
            </span>
          </h3>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRun}
              disabled={isPending || rules.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={12} aria-hidden="true" />
              {isPending ? "Running…" : "Run now"}
            </button>
            <button
              type="button"
              onClick={() => setIsAdding((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-md bg-aegean-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-aegean-700"
            >
              <Plus size={13} aria-hidden="true" />
              New rule
            </button>
          </div>
        </header>

        <AdminError message={error} />

        {isAdding && (
          <form onSubmit={handleCreate} className="mt-4 grid gap-3 rounded-md bg-stone-50 p-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-stone-700">Rule name</span>
              <input
                type="text"
                name="name"
                required
                placeholder="Chase stalled deals"
                className={ADMIN_FIELD_CLASS}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-stone-700">When</span>
              <select
                value={trigger}
                onChange={(event) => setTrigger(event.target.value)}
                aria-label="Trigger"
                className={ADMIN_FIELD_CLASS}
              >
                {AUTOMATION_TRIGGERS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-stone-500">{definition?.description}</span>
            </label>

            {/* Shown only for triggers that use it — a "days" box on
            "a payment goes overdue" would imply a setting that does nothing. */}
            {usesThreshold && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-stone-700">For how many days</span>
                <input
                  type="number"
                  name="thresholdDays"
                  min="1"
                  step="1"
                  required
                  defaultValue={definition?.defaultThresholdDays}
                  className={ADMIN_FIELD_CLASS}
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-stone-700">Then</span>
              <select name="action" aria-label="Action" className={ADMIN_FIELD_CLASS}>
                {AUTOMATION_ACTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-stone-700">Message</span>
              <input
                type="text"
                name="messageTemplate"
                required
                defaultValue={`Follow up on ${SUBJECT_PLACEHOLDER} — nothing has moved.`}
                className={ADMIN_FIELD_CLASS}
              />
              <span className="text-xs text-stone-500">
                Use <code className="rounded bg-stone-200 px-1">{SUBJECT_PLACEHOLDER}</code> for the
                name of whatever matched.
              </span>
            </label>

            <div className="flex items-center gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-aegean-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-aegean-700 disabled:opacity-60"
              >
                Save rule
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-sm text-stone-500 hover:text-stone-800"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {rules.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">
            No rules yet. Add one to be told when a deal stalls or a payment slips.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-stone-100">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-3 py-3">
                <label className="inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={() =>
                      run(() => setRuleEnabledAction(rule.id, !rule.enabled), () => router.refresh())
                    }
                    disabled={isPending}
                    aria-label={rule.enabled ? `Disable ${rule.name}` : `Enable ${rule.name}`}
                  />
                </label>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      rule.enabled ? "text-stone-900" : "text-stone-400"
                    }`}
                  >
                    {rule.name}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {rule.triggerLabel}
                    {rule.thresholdDays !== null ? ` after ${rule.thresholdDays} days` : ""} ·{" "}
                    {rule.action === "CREATE_TASK" ? "creates a task" : "sends a notification"}
                  </p>
                </div>

                <span className="shrink-0 text-xs text-stone-400">
                  {/* "Never run" and "ran, matched nothing" are genuinely
                  different states and are shown as such. */}
                  {rule.lastRunAt === null
                    ? "Never run"
                    : `${dateTimeFormatter.format(new Date(rule.lastRunAt))} · ${
                        rule.lastMatchCount === null
                          ? "failed"
                          : `${rule.lastMatchCount} match${rule.lastMatchCount === 1 ? "" : "es"}`
                      }`}
                </span>

                <button
                  type="button"
                  onClick={() => handleDelete(rule)}
                  disabled={isPending}
                  aria-label={`Delete rule: ${rule.name}`}
                  className="rounded p-1.5 text-stone-400 transition-colors hover:bg-coral-100 hover:text-coral-700 disabled:opacity-60"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lastRun && (
        <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Last run
          </h3>
          {lastRun.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">No enabled rules to run.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {lastRun.map((result) => (
                <li key={result.ruleId} className="text-sm text-stone-700">
                  <span className="font-medium">{result.ruleName}</span>:{" "}
                  {result.matched} matched, {result.delivered} sent
                  {/* Surfaced rather than hidden: an admin who sees "3 matched,
                  0 sent" needs to know it was de-duplication, not a failure. */}
                  {result.suppressed > 0 && `, ${result.suppressed} already sent recently`}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
