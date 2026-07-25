"use client";

import { useState, useTransition, type ReactNode } from "react";

/**
 * Shared presentation + submit-lifecycle primitives for the admin-only
 * editing panels (client detail, property detail). Extracted because both
 * panels need the identical "disable while pending, surface a rejection as
 * an inline alert" behavior that PropertyForm established — duplicating it
 * per panel is how the two would silently drift apart.
 */

export const ADMIN_FIELD_CLASS =
  "w-full rounded-md border border-stone-300 bg-stone-0 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-aegean-500 focus:outline-none focus:ring-2 focus:ring-aegean-100";

export const ADMIN_BUTTON_CLASS =
  "rounded-md bg-aegean-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-aegean-700 disabled:cursor-not-allowed disabled:opacity-60";

export function AdminSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function AdminField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}

/**
 * Wraps a Server Action call with the pending/error handling every admin
 * control needs. Returns `run`, which never rejects — it routes failures
 * into `error` for inline display instead, so a rejected action can't
 * surface as an unhandled promise rejection in the browser console.
 */
export function useAdminAction() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    });
  }

  return { error, isPending, run };
}

export function AdminError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-3 rounded-md bg-coral-100 px-3 py-2 text-sm text-coral-700">
      {message}
    </div>
  );
}
