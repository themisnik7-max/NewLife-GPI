"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { PropertyStatus } from "@/lib/projects";

/**
 * Matches src/lib/data/projects.ts's PropertyInput field-for-field, with all
 * numeric/date fields as plain strings — HTML form inputs always produce
 * strings, and the data layer's own validators are the single source of
 * truth for what's actually valid, so this component doesn't duplicate that
 * logic beyond "is this parseable at all," just enough to give inline
 * feedback before ever calling the server.
 */
export interface PropertyFormValues {
  name: string;
  address: string;
  area: string;
  totalUnits: string;
  availableUnits: string;
  deliveryDate: string;
  contractDate: string;
  floor: string;
  sqm: string;
  energyClass: string;
  status: PropertyStatus;
  imageUrl: string;
  mapUrl: string;
  pptUrl: string;
}

const EMPTY_VALUES: PropertyFormValues = {
  name: "",
  address: "",
  area: "",
  totalUnits: "",
  availableUnits: "",
  deliveryDate: "",
  contractDate: "",
  floor: "",
  sqm: "",
  energyClass: "",
  status: "PLANNING",
  imageUrl: "",
  mapUrl: "",
  pptUrl: "",
};

const STATUS_OPTIONS: Array<{ value: PropertyStatus; label: string }> = [
  { value: "PLANNING", label: "Planning" },
  { value: "UNDER_CONSTRUCTION", label: "Under Construction" },
  { value: "COMPLETED", label: "Completed" },
];

export interface PropertyFormSubmitValues {
  name: string;
  address: string;
  area: string;
  totalUnits: number;
  availableUnits: number;
  deliveryDate: string;
  contractDate: string;
  floor: number;
  sqm: number;
  energyClass: string;
  status: PropertyStatus;
  imageUrl?: string;
  mapUrl?: string;
  pptUrl?: string | null;
}

export interface PropertyFormProps {
  initialValues?: Partial<PropertyFormValues>;
  submitLabel: string;
  onSubmit: (values: PropertyFormSubmitValues) => Promise<void>;
  onCancel?: () => void;
}

const FIELD_CLASS =
  "w-full rounded-md border border-stone-300 bg-stone-0 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-aegean-500 focus:outline-none focus:ring-2 focus:ring-aegean-100";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}

/**
 * One form for both creating and editing a Property — the page decides
 * which via `initialValues` (omitted for create) and what `onSubmit` does
 * (createPropertyAction vs. updatePropertyAction), matching this codebase's
 * established convention of passing Server Actions in as props (ApiKeyCard's
 * onRevoke, TopNav's onMarkNotificationRead) rather than importing them
 * directly into a Client Component.
 */
export function PropertyForm({ initialValues, submitLabel, onSubmit, onCancel }: PropertyFormProps) {
  const [values, setValues] = useState<PropertyFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setField<K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const totalUnits = Number(values.totalUnits);
    const availableUnits = Number(values.availableUnits);
    const floor = Number(values.floor);
    const sqm = Number(values.sqm);

    if (!Number.isFinite(totalUnits) || !Number.isFinite(availableUnits) || !Number.isFinite(floor) || !Number.isFinite(sqm)) {
      setError("Total units, available units, floor, and size must all be numbers.");
      return;
    }

    startTransition(async () => {
      try {
        await onSubmit({
          name: values.name,
          address: values.address,
          area: values.area,
          totalUnits,
          availableUnits,
          deliveryDate: values.deliveryDate,
          contractDate: values.contractDate,
          floor,
          sqm,
          energyClass: values.energyClass,
          status: values.status,
          imageUrl: values.imageUrl || undefined,
          mapUrl: values.mapUrl || undefined,
          pptUrl: values.pptUrl || null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-lg border border-stone-200 bg-stone-0 p-6 shadow-sm"
    >
      {error && (
        <div role="alert" className="rounded-md bg-coral-100 px-3 py-2 text-sm text-coral-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input
            required
            className={FIELD_CLASS}
            value={values.name}
            onChange={(e) => setField("name", e.target.value)}
          />
        </Field>
        <Field label="Area">
          <input
            required
            className={FIELD_CLASS}
            value={values.area}
            onChange={(e) => setField("area", e.target.value)}
          />
        </Field>
        <Field label="Address">
          <input
            required
            className={`${FIELD_CLASS} sm:col-span-2`}
            value={values.address}
            onChange={(e) => setField("address", e.target.value)}
          />
        </Field>
        <Field label="Total units">
          <input
            required
            type="number"
            min={0}
            step={1}
            className={FIELD_CLASS}
            value={values.totalUnits}
            onChange={(e) => setField("totalUnits", e.target.value)}
          />
        </Field>
        <Field label="Available units">
          <input
            required
            type="number"
            min={0}
            step={1}
            className={FIELD_CLASS}
            value={values.availableUnits}
            onChange={(e) => setField("availableUnits", e.target.value)}
          />
        </Field>
        <Field label="Floor">
          <input
            required
            type="number"
            step={1}
            className={FIELD_CLASS}
            value={values.floor}
            onChange={(e) => setField("floor", e.target.value)}
          />
        </Field>
        <Field label="Size (m²)">
          <input
            required
            type="number"
            min={0}
            step="any"
            className={FIELD_CLASS}
            value={values.sqm}
            onChange={(e) => setField("sqm", e.target.value)}
          />
        </Field>
        <Field label="Energy class">
          <input
            required
            placeholder="A, A+, B…"
            className={FIELD_CLASS}
            value={values.energyClass}
            onChange={(e) => setField("energyClass", e.target.value)}
          />
        </Field>
        <Field label="Status">
          <select
            className={FIELD_CLASS}
            value={values.status}
            onChange={(e) => setField("status", e.target.value as PropertyStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Delivery date">
          <input
            required
            type="date"
            className={FIELD_CLASS}
            value={values.deliveryDate}
            onChange={(e) => setField("deliveryDate", e.target.value)}
          />
        </Field>
        <Field label="Contract date">
          <input
            required
            type="date"
            className={FIELD_CLASS}
            value={values.contractDate}
            onChange={(e) => setField("contractDate", e.target.value)}
          />
        </Field>
        <Field label="Photo URL (optional — a placeholder is used if left blank)">
          <input
            className={`${FIELD_CLASS} sm:col-span-2`}
            value={values.imageUrl}
            onChange={(e) => setField("imageUrl", e.target.value)}
          />
        </Field>
        <Field label="Map URL (optional — derived from the address if left blank)">
          <input
            className={`${FIELD_CLASS} sm:col-span-2`}
            value={values.mapUrl}
            onChange={(e) => setField("mapUrl", e.target.value)}
          />
        </Field>
        <Field label="Presentation deck URL (optional)">
          <input
            className={`${FIELD_CLASS} sm:col-span-2`}
            value={values.pptUrl}
            onChange={(e) => setField("pptUrl", e.target.value)}
          />
        </Field>
      </div>

      <div className="flex gap-2 border-t border-stone-100 pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-aegean-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-aegean-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
