"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VisaStepEntry } from "@/lib/data/visa";
import type { Project } from "@/lib/projects";
import { SLOT_CONTENT_TYPES, type RentalStageView } from "@/lib/rentalStages";
import {
  AdminError,
  AdminField,
  AdminSection,
  ADMIN_BUTTON_CLASS,
  ADMIN_FIELD_CLASS,
  useAdminAction,
} from "@/components/ui/adminControls";
import {
  assignPropertyAction,
  createLedgerEntryAction,
  createVisaStepAction,
  getRentalStageFileUrlAction,
  setOfferDetailsAction,
  setRentalStageStatusAction,
  updateVisaStepStatusAction,
  uploadRentalStageFileAction,
} from "./actions";

const MILESTONE_STATUSES: Array<{ value: VisaStepEntry["status"]; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
];

export interface ClientAdminPanelProps {
  userId: string;
  /** Every property in the tenant, for the assignment picker. */
  availableProperties: Project[];
  /** The client's currently assigned property, if any. */
  assignedProperty: Project | null;
  rentalStages: RentalStageView[];
  visaSteps: VisaStepEntry[];
  /** False when SUPABASE_SECRET_KEY is unset — upload controls then explain
   * themselves instead of failing on click. */
  storageConfigured: boolean;
}

/**
 * Admin-only editing controls for a single client, rendered alongside (not
 * inside) the read-only ClientOverviewSummary — that component is also used
 * on a client's own Overview, where none of this must ever appear.
 *
 * router.refresh() after each successful action re-runs the parent Server
 * Component so the read-only summary above reflects the change; the actions'
 * own revalidatePath only invalidates the cache, it doesn't push new data
 * into an already-mounted client tree.
 */
export function ClientAdminPanel({
  userId,
  availableProperties,
  assignedProperty,
  rentalStages,
  visaSteps,
  storageConfigured,
}: ClientAdminPanelProps) {
  const router = useRouter();
  const { error, isPending, run } = useAdminAction();

  const [propertyId, setPropertyId] = useState(availableProperties[0]?.id ?? "");
  const [visaTitle, setVisaTitle] = useState("");
  const [visaDescription, setVisaDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const offerStage = rentalStages.find((stage) => stage.hasOfferFields);
  const [offerPrice, setOfferPrice] = useState(offerStage?.offerPrice?.toString() ?? "");
  const [offerDuration, setOfferDuration] = useState(offerStage?.offerDurationMonths?.toString() ?? "");
  const [offerComments, setOfferComments] = useState(offerStage?.offerComments ?? "");

  const refresh = () => router.refresh();

  // Opens the file in a new tab via a freshly-minted, short-lived signed URL
  // rather than storing a link — the bucket is private, so there is no
  // durable URL to render.
  function openAttachment(stageKey: string) {
    run(async () => {
      const url = await getRentalStageFileUrlAction(userId, stageKey);
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-bold text-stone-900">Manage this client</h2>
        <p className="text-sm text-stone-500">Only administrators can see and use these controls.</p>
      </div>

      <AdminError message={error} />

      <AdminSection title="Assigned property">
        {assignedProperty ? (
          <p className="mb-3 text-sm text-stone-700">
            Currently assigned: <span className="font-semibold">{assignedProperty.name}</span>
          </p>
        ) : (
          <p className="mb-3 text-sm text-stone-500">No property assigned yet.</p>
        )}

        {availableProperties.length === 0 ? (
          <p className="text-sm text-stone-500">
            No properties exist in this tenant yet — create one first from Available Projects.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <AdminField label={assignedProperty ? "Assign a different property" : "Assign a property"}>
                <select
                  className={ADMIN_FIELD_CLASS}
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                >
                  {availableProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name} — {property.area}
                    </option>
                  ))}
                </select>
              </AdminField>
            </div>
            <button
              type="button"
              disabled={isPending || !propertyId}
              onClick={() => run(() => assignPropertyAction(userId, propertyId), refresh)}
              className={ADMIN_BUTTON_CLASS}
            >
              Assign
            </button>
          </div>
        )}
      </AdminSection>

      <AdminSection title="Rental workflow">
        <ul className="flex flex-col gap-3">
          {rentalStages.map((stage) => (
            <li key={stage.key} className="flex flex-col gap-2 border-b border-stone-100 pb-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-stone-900">
                  {stage.order}. {stage.label}
                </span>
                <select
                  aria-label={`Status for ${stage.label}`}
                  className="rounded-md border border-stone-300 bg-stone-0 px-2 py-1 text-xs text-stone-900"
                  value={stage.status}
                  disabled={isPending}
                  onChange={(e) =>
                    run(
                      () => setRentalStageStatusAction(userId, stage.key, e.target.value as "PENDING" | "DONE"),
                      refresh,
                    )
                  }
                >
                  <option value="PENDING">Pending</option>
                  <option value="DONE">Done</option>
                </select>
              </div>

              {stage.slot !== "none" && (
                <div className="flex flex-wrap items-center gap-3 pl-4">
                  {stage.hasAttachment && (
                    <button
                      type="button"
                      disabled={isPending || !storageConfigured}
                      onClick={() => openAttachment(stage.key)}
                      className="text-xs font-semibold text-aegean-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {stage.attachmentFilename}
                    </button>
                  )}
                  {storageConfigured ? (
                    <label className="text-xs text-stone-600">
                      <span className="sr-only">
                        {stage.hasAttachment ? "Replace file" : "Upload file"} for {stage.label}
                      </span>
                      <input
                        type="file"
                        accept={SLOT_CONTENT_TYPES[stage.slot].join(",")}
                        disabled={isPending}
                        className="text-xs file:mr-2 file:rounded-md file:border file:border-stone-300 file:bg-stone-0 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-stone-700"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const formData = new FormData();
                          formData.append("userId", userId);
                          formData.append("stageKey", stage.key);
                          formData.append("file", file);
                          e.target.value = "";
                          run(() => uploadRentalStageFileAction(formData), refresh);
                        }}
                      />
                    </label>
                  ) : (
                    <span className="text-xs text-stone-500">
                      File storage is not configured — set SUPABASE_URL and SUPABASE_SECRET_KEY to enable uploads.
                    </span>
                  )}
                </div>
              )}

              {stage.hasOfferFields && (
                <div className="flex flex-wrap items-end gap-3 pl-4">
                  <div className="min-w-[120px]">
                    <AdminField label="Offer price (EUR)">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={ADMIN_FIELD_CLASS}
                        value={offerPrice}
                        onChange={(e) => setOfferPrice(e.target.value)}
                      />
                    </AdminField>
                  </div>
                  <div className="min-w-[120px]">
                    <AdminField label="Duration (months)">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className={ADMIN_FIELD_CLASS}
                        value={offerDuration}
                        onChange={(e) => setOfferDuration(e.target.value)}
                      />
                    </AdminField>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <AdminField label="Comments">
                      <input
                        className={ADMIN_FIELD_CLASS}
                        value={offerComments}
                        onChange={(e) => setOfferComments(e.target.value)}
                      />
                    </AdminField>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () =>
                          setOfferDetailsAction(userId, {
                            price: offerPrice ? Number(offerPrice) : null,
                            durationMonths: offerDuration ? Number(offerDuration) : null,
                            comments: offerComments || null,
                          }),
                        refresh,
                      )
                    }
                    className={ADMIN_BUTTON_CLASS}
                  >
                    Save offer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </AdminSection>

      <AdminSection title="Golden Visa steps">
        {visaSteps.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {visaSteps.map((step) => (
              <li key={step.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-2 last:border-0">
                <span className="text-sm text-stone-900">
                  {step.stepOrder}. {step.title}
                </span>
                <select
                  aria-label={`Status for ${step.title}`}
                  className="rounded-md border border-stone-300 bg-stone-0 px-2 py-1 text-xs text-stone-900"
                  value={step.status}
                  disabled={isPending}
                  onChange={(e) =>
                    run(
                      () => updateVisaStepStatusAction(userId, step.id, e.target.value as VisaStepEntry["status"]),
                      refresh,
                    )
                  }
                >
                  {MILESTONE_STATUSES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <AdminField label="New step title">
              <input
                className={ADMIN_FIELD_CLASS}
                value={visaTitle}
                onChange={(e) => setVisaTitle(e.target.value)}
                placeholder="e.g. Biometrics appointment"
              />
            </AdminField>
          </div>
          <div className="min-w-[200px] flex-1">
            <AdminField label="Description (optional)">
              <input
                className={ADMIN_FIELD_CLASS}
                value={visaDescription}
                onChange={(e) => setVisaDescription(e.target.value)}
              />
            </AdminField>
          </div>
          <button
            type="button"
            disabled={isPending || !visaTitle.trim()}
            onClick={() =>
              run(
                () => createVisaStepAction(userId, { title: visaTitle, description: visaDescription || null }),
                () => {
                  setVisaTitle("");
                  setVisaDescription("");
                  refresh();
                },
              )
            }
            className={ADMIN_BUTTON_CLASS}
          >
            Add step
          </button>
        </div>
      </AdminSection>

      <AdminSection title="Payment installments">
        {assignedProperty ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[160px] flex-1">
              <AdminField label="Amount (EUR)">
                <input
                  type="number"
                  min={0}
                  step="any"
                  className={ADMIN_FIELD_CLASS}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </AdminField>
            </div>
            <div className="min-w-[160px] flex-1">
              <AdminField label="Due date">
                <input
                  type="date"
                  className={ADMIN_FIELD_CLASS}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </AdminField>
            </div>
            <button
              type="button"
              disabled={isPending || !amount || !dueDate}
              onClick={() =>
                run(
                  () => createLedgerEntryAction(userId, assignedProperty.id, Number(amount), dueDate),
                  () => {
                    setAmount("");
                    setDueDate("");
                    refresh();
                  },
                )
              }
              className={ADMIN_BUTTON_CLASS}
            >
              Add installment
            </button>
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            Assign a property first — an installment is always owed against a specific property.
          </p>
        )}
      </AdminSection>
    </div>
  );
}
