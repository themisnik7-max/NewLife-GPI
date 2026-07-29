"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, UserCheck } from "lucide-react";
import type { ContactView } from "@/lib/pipeline";
import { AdminError, ADMIN_FIELD_CLASS, useAdminAction } from "@/components/ui/adminControls";
import { createContactAction } from "./actions";

/**
 * The contact book — everyone the business is talking to, whether or not they
 * have an account yet.
 *
 * The "Client" badge is the visible half of the conversion described in
 * src/lib/data/pipeline.ts: a contact whose email later matched a new Clerk
 * account is linked automatically by the webhook, and from that point their
 * pre-sale history and their client record are one thing. Until then they are
 * a name in a list with no page to link to, which is the honest rendering of
 * a person who has not signed up.
 */

export interface ContactsPanelProps {
  contacts: ContactView[];
}

export function ContactsPanel({ contacts }: ContactsPanelProps) {
  const router = useRouter();
  const { error, isPending, run } = useAdminAction();
  const [isAdding, setIsAdding] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    run(
      () =>
        createContactAction({
          firstName: String(formData.get("firstName") ?? ""),
          lastName: String(formData.get("lastName") ?? ""),
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          nationality: String(formData.get("nationality") ?? ""),
          source: String(formData.get("source") ?? ""),
          notes: String(formData.get("notes") ?? ""),
        }),
      () => {
        form.reset();
        setIsAdding(false);
        router.refresh();
      },
    );
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Contacts
          <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
            {contacts.length}
          </span>
        </h3>
        <button
          type="button"
          onClick={() => setIsAdding((current) => !current)}
          className="inline-flex items-center gap-1.5 rounded-md bg-aegean-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-aegean-700"
        >
          <Plus size={13} aria-hidden="true" />
          Add contact
        </button>
      </header>

      <AdminError message={error} />

      {isAdding && (
        <form onSubmit={handleSubmit} className="mt-3 grid gap-3 rounded-md bg-stone-50 p-3 sm:grid-cols-2">
          {/* Only the first name is required. A form that demands an email
          before it will save anything is a form people work around by not
          using the CRM at all. */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">First name *</span>
            <input type="text" name="firstName" required className={ADMIN_FIELD_CLASS} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Last name</span>
            <input type="text" name="lastName" className={ADMIN_FIELD_CLASS} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Email</span>
            <input type="email" name="email" className={ADMIN_FIELD_CLASS} />
            <span className="text-xs text-stone-500">
              Used to link this contact to their account when they sign up.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Phone</span>
            <input type="tel" name="phone" className={ADMIN_FIELD_CLASS} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Nationality</span>
            <input type="text" name="nationality" className={ADMIN_FIELD_CLASS} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Source</span>
            <input
              type="text"
              name="source"
              placeholder="Referral, Website, Portal…"
              className={ADMIN_FIELD_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-stone-700">Notes</span>
            <textarea name="notes" rows={2} className={ADMIN_FIELD_CLASS} />
          </label>

          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-aegean-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-aegean-700 disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save contact"}
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

      {contacts.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">
          No contacts yet. Add the first person you are talking to.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-stone-100">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-stone-900">
                  {contact.clerkUserId ? (
                    <Link
                      href={`/dashboard/clients/${contact.clerkUserId}`}
                      className="hover:text-aegean-700 hover:underline"
                    >
                      {contact.fullName}
                    </Link>
                  ) : (
                    contact.fullName
                  )}
                  {contact.clerkUserId && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                      <UserCheck size={10} aria-hidden="true" />
                      Client
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-stone-500">
                  {[contact.email, contact.phone, contact.nationality, contact.source]
                    .filter(Boolean)
                    .join(" · ") || "No details recorded"}
                </p>
              </div>

              <span className="shrink-0 text-xs text-stone-500">
                {contact.openDealCount === 0
                  ? "No open deals"
                  : `${contact.openDealCount} open deal${contact.openDealCount === 1 ? "" : "s"}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
