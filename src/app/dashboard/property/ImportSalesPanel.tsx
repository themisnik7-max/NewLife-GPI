"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import {
  SOLD_PROPERTY_FIELDS,
  buildImportPlan,
  guessMapping,
  missingRequiredFields,
  readCsv,
  type ParsedCsv,
} from "@/lib/csv";
import type { ImportResult } from "@/lib/data/imports";
import { AdminError, ADMIN_FIELD_CLASS, useAdminAction } from "@/components/ui/adminControls";
import { importSalesAction } from "./importActions";

/**
 * Import sold properties from a spreadsheet.
 *
 * ⚠️ CSV, NOT .xlsx — deliberately, for now. Reading a real Excel workbook
 * needs a dependency, and CLAUDE.md fixes the stack and requires approval
 * before anything is added. Excel exports CSV natively (File → Save As →
 * CSV UTF-8), so this covers the case today rather than waiting on a
 * decision. If .xlsx is approved later, only the parser changes.
 *
 * The flow is upload → map columns → preview → apply, and the preview is the
 * point. An importer that just runs leaves the user finding out afterwards
 * that 40 rows went somewhere unexpected; showing exactly what will happen,
 * per row, before anything is written is what makes a paste from a
 * spreadsheet safe.
 */

export function ImportSalesPanel() {
  const router = useRouter();
  const { error, isPending, run } = useAdminAction();
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null | undefined): Promise<void> {
    setLocalError(null);
    setResult(null);
    if (!file) return;

    const text = await file.text();
    const next = readCsv(text);

    if (next.headers.length === 0 || next.rows.length === 0) {
      setLocalError("That file has no rows. Check it has a header row and at least one entry.");
      setParsed(null);
      return;
    }

    setParsed(next);
    setFileName(file.name);
    // A guess, shown for confirmation rather than applied silently — a wrong
    // guess that quietly imports 40 rows into the wrong column costs far more
    // than one the user corrects in a dropdown.
    setMapping(guessMapping(next.headers, SOLD_PROPERTY_FIELDS));
  }

  const plan = parsed ? buildImportPlan(parsed, mapping) : null;
  const missing = parsed ? missingRequiredFields(mapping, SOLD_PROPERTY_FIELDS) : [];
  const canApply = Boolean(plan && plan.validCount > 0 && missing.length === 0);

  function handleApply(): void {
    if (!parsed) return;
    run(
      async () => {
        const outcome = await importSalesAction({ parsed, mapping });
        setResult(outcome);
      },
      () => router.refresh(),
    );
  }

  function reset(): void {
    setParsed(null);
    setFileName(null);
    setResult(null);
    setLocalError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Import sales from a spreadsheet
        </h3>
        {parsed && (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-semibold text-stone-500 hover:text-stone-800"
          >
            Start over
          </button>
        )}
      </header>

      <AdminError message={error ?? localError} />

      {!parsed && (
        <div className="mt-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50">
            <Upload size={15} aria-hidden="true" />
            Choose a CSV file
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleFile(event.target.files?.[0])}
              className="sr-only"
              aria-label="Choose a CSV file to import"
            />
          </label>
          <p className="mt-2 text-xs text-stone-500">
            In Excel: File → Save As → CSV UTF-8. Needs a header row with the property and the
            buyer&apos;s email; price and date are optional.
          </p>
        </div>
      )}

      {parsed && !result && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-stone-600">
            <span className="font-medium text-stone-900">{fileName}</span> — {parsed.rows.length}{" "}
            row{parsed.rows.length === 1 ? "" : "s"}
          </p>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              Match your columns
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {SOLD_PROPERTY_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-stone-700">
                    {field.label}
                    {field.required && " *"}
                  </span>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field.key]: event.target.value === "" ? null : Number(event.target.value),
                      }))
                    }
                    aria-label={field.label}
                    className={ADMIN_FIELD_CLASS}
                  >
                    <option value="">Not imported</option>
                    {parsed.headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header}
                      </option>
                    ))}
                  </select>
                  {field.hint && <span className="text-xs text-stone-500">{field.hint}</span>}
                </label>
              ))}
            </div>
          </div>

          {missing.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Match a column for: {missing.join(", ")}.
            </p>
          )}

          {plan && missing.length === 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Preview
              </p>
              <p className="mt-1 text-sm text-stone-700">
                {plan.validCount} row{plan.validCount === 1 ? "" : "s"} will be imported
                {plan.skippedCount > 0 && `, ${plan.skippedCount} skipped`}.
              </p>

              {plan.skippedCount > 0 && (
                <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md bg-stone-50 p-2">
                  {plan.rows
                    .filter((row) => row.problems.length > 0)
                    .map((row) => (
                      <li key={row.lineNumber} className="text-xs text-stone-600">
                        {/* Named by the line the user can go and look at. */}
                        <span className="font-semibold">Row {row.lineNumber}:</span>{" "}
                        {row.problems.join(" ")}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleApply}
            disabled={isPending || !canApply}
            className="self-start rounded-md bg-aegean-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-aegean-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending
              ? "Importing…"
              : `Import ${plan?.validCount ?? 0} row${plan?.validCount === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {result && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm text-stone-900">
            <span className="font-semibold">{result.created}</span> created,{" "}
            <span className="font-semibold">{result.updated}</span> updated,{" "}
            {result.skipped} skipped, {result.failed} failed.
          </p>

          {/* Every non-success is listed. An import that says "40 done" while
          silently dropping 12 is the failure this exists to prevent. */}
          {(result.failed > 0 || result.skipped > 0) && (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md bg-stone-50 p-2">
              {result.rows
                .filter((row) => row.outcome === "failed" || row.outcome === "skipped")
                .map((row) => (
                  <li key={row.lineNumber} className="text-xs text-stone-600">
                    <span className="font-semibold">Row {row.lineNumber}</span> ({row.outcome}):{" "}
                    {row.detail}
                  </li>
                ))}
            </ul>
          )}

          <button
            type="button"
            onClick={reset}
            className="self-start text-sm font-semibold text-aegean-600 hover:underline"
          >
            Import another file
          </button>
        </div>
      )}
    </section>
  );
}
