"use client";

import { useState } from "react";
import {
  ADMIN_BUTTON_CLASS,
  ADMIN_FIELD_CLASS,
  AdminError,
  AdminField,
  AdminSection,
  useAdminAction,
} from "@/components/ui/adminControls";
import { updateSaleDetailsAction } from "./actions";
import type { OwnershipRecord } from "@/lib/data/propertyOwnership";

/**
 * Lets an admin record the real sale date and price for each buyer.
 *
 * One form per ownership row rather than one form for the property: a
 * property can have several buyers with different dates and prices, and a
 * single shared form would quietly overwrite one buyer's figures with
 * another's.
 *
 * Empty input is submitted as null (clear), not skipped. That is what makes a
 * mistyped price correctable — a form where blanking a field is a no-op can
 * only ever add data, never remove it.
 */

interface SaleDetailsPanelProps {
  propertyId: string;
  ownerships: OwnershipRecord[];
}

function SaleForm({ propertyId, ownership }: { propertyId: string; ownership: OwnershipRecord }) {
  const [saleDate, setSaleDate] = useState(ownership.saleDate ?? "");
  const [salePrice, setSalePrice] = useState(ownership.salePrice === null ? "" : String(ownership.salePrice));
  const [saved, setSaved] = useState(false);
  const { error, isPending, run } = useAdminAction();

  function submit() {
    setSaved(false);
    const trimmedPrice = salePrice.trim();
    const parsedPrice = trimmedPrice === "" ? null : Number(trimmedPrice);

    // Caught here so a typo shows as a sentence next to the field rather
    // than as a server error after a round trip. The data layer validates
    // the same rule again — this is convenience, not the enforcement point.
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      run(async () => {
        throw new Error("Sale price must be a positive number.");
      });
      return;
    }

    run(
      () =>
        updateSaleDetailsAction(propertyId, ownership.id, {
          saleDate: saleDate.trim() === "" ? null : saleDate,
          salePrice: parsedPrice,
        }),
      () => setSaved(true),
    );
  }

  return (
    <div className="border-t border-stone-100 py-4 first:border-0 first:pt-0">
      <p className="text-sm font-medium text-stone-900">{ownership.clientName}</p>
      <AdminError message={error} />
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <AdminField label="Sale date">
            <input
              type="date"
              value={saleDate}
              onChange={(event) => setSaleDate(event.target.value)}
              className={ADMIN_FIELD_CLASS}
            />
          </AdminField>
        </div>
        <div className="w-44">
          <AdminField label="Sale price (€)">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={salePrice}
              onChange={(event) => setSalePrice(event.target.value)}
              placeholder="Not recorded"
              className={ADMIN_FIELD_CLASS}
            />
          </AdminField>
        </div>
        <button type="button" onClick={submit} disabled={isPending} className={ADMIN_BUTTON_CLASS}>
          {isPending ? "Saving…" : "Save"}
        </button>
        {saved && !isPending && (
          <span role="status" className="text-sm text-olive-700">
            Saved
          </span>
        )}
      </div>
    </div>
  );
}

export function SaleDetailsPanel({ propertyId, ownerships }: SaleDetailsPanelProps) {
  if (ownerships.length === 0) return null;

  return (
    <AdminSection title="Record sale details">
      <p className="mb-3 text-sm text-stone-500">
        The real date and price of each sale. Separate from when the ownership was recorded in this app — leave blank
        if you do not have the figure yet rather than entering a placeholder.
      </p>
      {ownerships.map((ownership) => (
        <SaleForm key={ownership.id} propertyId={propertyId} ownership={ownership} />
      ))}
    </AdminSection>
  );
}
