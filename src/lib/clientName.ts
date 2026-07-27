/**
 * Client/test-safe: pure string formatting, no database or Node-only APIs, so
 * this is importable from Client Components as well as from every `server-only`
 * data module.
 *
 * Extracted because five different admin views now render a client's name
 * (Clients directory, sold-property buyers, Golden Visa roll-up, Payments,
 * Rentals) and each had started to grow its own copy of the same
 * "first + last, or fall back to email" rule. Diverging fallbacks would make
 * the same person appear under two different labels on two pages.
 */

/**
 * Renders a display name from Clerk-synced fields.
 *
 * Falls back to the email address rather than a placeholder like "Unknown":
 * Clerk permits an email-only user with no name set, and in that case the
 * email is the only real identifier the admin has to go on.
 */
export function toDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string,
): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || email;
}

/**
 * Two-letter initials for an avatar.
 *
 * Derived from the display name, so an email-only user gets initials from
 * their address instead of rendering blank. Non-letter characters are
 * skipped so "j.doe@example.com" yields "JD", not "J.".
 */
export function toInitials(displayName: string): string {
  const letters = displayName
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase());

  if (letters.length === 0) return "?";
  return letters.length === 1 ? letters[0]! : `${letters[0]!}${letters[letters.length - 1]!}`;
}
