"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminError, ADMIN_FIELD_CLASS, useAdminAction } from "@/components/ui/adminControls";
import { recordSaleAction } from "./actions";

/**
 * One-step "Record a sale" — buyer, unit, price and date in a single action.
 *
 * Replaces a three-page flow: create the property under Available Projects,
 * open the buyer's profile to assign it, then return to the property to set
 * price and date. That is one business event spread across three screens, and
 * it is the thing that could not be done from the page where sold properties
 * are listed.
 *
 * Deliberately does NOT create properties or clients inline. A property needs
 * a dozen fields (area, floor, sqm, delivery date, energy class) that do not
 * belong in a sale dialog, and a client cannot be created here at all — a
 * `User` row is written only by the Clerk webhook, so "add a buyer" means
 * inviting them. Offering either as a stub would produce half-populated
 * records that someone has to find and finish later. Both are linked instead.
 */

export interface RecordSalePanelProps {
  /** Every property in the tenant, for the picker. */
  properties: { id: string; name: string; area: string }[];
  /** Every client — buyers must already exist as accounts. */
  clients: { id: string; name: string; email: string }[];
}

export function RecordSalePanel({ properties, clients }: RecordSalePanelProps) {
  const router = useRouter();
  const { error, isPending, run } = useAdminAction();
  const [isOpen, setIsOpen] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    run(
      () =>
        recordSaleAction({
          userId: String(formData.get("userId") ?? ""),
          propertyId: String(formData.get("propertyId") ?? ""),
          saleDate: String(formData.get("saleDate") ?? ""),
          salePrice: String(formData.get("salePrice") ?? ""),
        }),
      () => {
        form.reset();
        setIsOpen(false);
        router.refresh();
      },
    );
  }

  const canRecord = properties.length > 0 && clients.length > 0;

  return (
    <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Record a sale
        </h3>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          disabled={!canRecord}
          className="inline-flex items-center gap-1.5 rounded-md bg-aegean-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-aegean-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          {isOpen ? "Close" : "Record a sale"}
        </button>
      </header>

      <AdminError message={error} />

      {/* Says which prerequisite is missing rather than a disabled button with
      no explanation — the two have different fixes on different pages. */}
      {properties.length === 0 && (
        <p className="mt-3 text-sm text-stone-500">
          No properties exist yet.{" "}
          <Link href="/dashboard/projects/new" className="font-semibold text-aegean-600 hover:underline">
            Add one first
          </Link>
          .
        </p>
      )}
      {properties.length > 0 && clients.length === 0 && (
        <p className="mt-3 text-sm text-stone-500">
          No clients yet — a buyer needs an account before a sale can be recorded against them.{" "}
          <Link href="/dashboard/team" className="font-semibold text-aegean-600 hover:underline">
            Invite one
          </Link>
          .
        </p>
      )}

      {isOpen && canRecord && (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 rounded-md bg-stone-50 p-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Property *</span>
            <select name="propertyId" required aria-label="Property" className={ADMIN_FIELD_CLASS}>
              <option value="">Choose a property…</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name} — {property.area}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Buyer *</span>
            <select name="userId" required aria-label="Buyer" className={ADMIN_FIELD_CLASS}>
              <option value="">Choose a buyer…</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} ({client.email})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Sale price</span>
            <input
              type="number"
              name="salePrice"
              min="0"
              step="1000"
              placeholder="e.g. 250000"
              aria-label="Sale price"
              className={ADMIN_FIELD_CLASS}
            />
            <span className="text-xs text-stone-500">
              Leave blank if not agreed yet — the total says how many are missing.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700">Sale date</span>
            <input type="date" name="saleDate" aria-label="Sale date" className={ADMIN_FIELD_CLASS} />
            <span className="text-xs text-stone-500">
              The date of the actual sale, not when it was entered here.
            </span>
          </label>

          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-aegean-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-aegean-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Recording…" : "Record sale"}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-sm text-stone-500 hover:text-stone-800"
            >
              Cancel
            </button>
            <span className="text-xs text-stone-500">
              Attach the contract on the property page afterwards.
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
