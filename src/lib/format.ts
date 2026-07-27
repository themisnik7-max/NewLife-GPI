/**
 * Client/test-safe display formatting. No database, no Node-only APIs.
 *
 * Extracted because the admin roll-up views added six more places that render
 * money and dates, and each existing page had built its own `Intl` instance
 * inline. Two pages disagreeing on whether €1,250.50 shows its cents is the
 * kind of inconsistency nobody files a bug for and everybody notices.
 *
 * Formatter instances are created once at module scope, not per call:
 * constructing an `Intl.NumberFormat` is comparatively expensive, and these
 * run once per table row.
 */

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" });

/** Whole-euro variant for dashboard headline figures, where cents are noise. */
const currencyCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function formatCurrency(amount: number): string {
  return currency.format(amount);
}

export function formatCurrencyCompact(amount: number): string {
  return currencyCompact.format(amount);
}

/**
 * Formats an ISO date string for display.
 *
 * Returns the placeholder for null/empty rather than throwing or rendering
 * "Invalid Date": across these admin views a missing sale date, date of
 * birth, or completion date is an expected and meaningful state, not an
 * error — and "—" reads as "not recorded" where "Invalid Date" reads as a bug.
 */
export function formatDate(iso: string | null | undefined, placeholder = "—"): string {
  if (!iso) return placeholder;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return placeholder;
  return date.format(parsed);
}

/** "3 of 10" — the progress phrasing used across every workflow summary. */
export function formatProgress(completed: number, total: number): string {
  return `${completed} of ${total}`;
}
