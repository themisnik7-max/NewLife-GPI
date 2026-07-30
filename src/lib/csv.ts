// Client/test-safe: a CSV reader and the pure functions that turn parsed rows
// into an import plan. No database access — the layer that applies a plan
// lives in src/lib/data/imports.ts (`server-only`).
//
// ⚠️ WHY A HAND-WRITTEN PARSER RATHER THAN A LIBRARY. The business asked to
// import sales data "from Excel". Reading a real .xlsx file needs a
// dependency (`xlsx` or similar), and CLAUDE.md fixes the stack and requires
// explicit approval before anything is added — which has not been given.
//
// CSV needs no dependency, and Excel exports it natively (File → Save As →
// CSV UTF-8), so this covers the actual case today rather than waiting. The
// parser below implements RFC 4180 properly — quoted fields, embedded commas
// and newlines, doubled quotes, CRLF — because the naive `split(",")` version
// silently corrupts any row containing an address with a comma in it, which
// is most of them.
//
// If .xlsx support is approved later, only readCsv() is replaced; everything
// below it works on parsed rows and does not care where they came from.

/** One parsed file: a header row plus data rows, all cells as raw strings. */
export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/**
 * Parses CSV text per RFC 4180.
 *
 * Handles: quoted fields, delimiters and newlines inside quotes, doubled
 * quotes as a literal quote, CRLF and LF line endings, and a UTF-8 BOM —
 * which Excel writes by default and which otherwise becomes an invisible
 * prefix on the first header, so "Property" silently fails to match
 * "Property".
 *
 * Ragged rows are preserved as-is rather than padded or rejected here;
 * `buildImportPlan` reports them per row, so one malformed line names itself
 * instead of failing the whole file.
 */
export function readCsv(text: string, delimiter = ","): ParsedCsv {
  // Excel's BOM. Stripped before anything else looks at the text.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === "") {
      // Only opens a quoted field at the start of one — a stray quote
      // mid-field is data, not syntax.
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      // CRLF or a lone CR both end the record.
      pushRow();
      i += input[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  // A file not ending in a newline still has a final record. A file ending in
  // one does not — otherwise every import gains a phantom empty row.
  if (field !== "" || row.length > 0) pushRow();

  // Blank lines anywhere are dropped: spreadsheets routinely export trailing
  // ones, and a row of empty strings is not a record anybody meant to import.
  const meaningful = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (meaningful.length === 0) return { headers: [], rows: [] };

  const [headers, ...dataRows] = meaningful;
  return { headers: headers.map((h) => h.trim()), rows: dataRows };
}

/**
 * Guesses which uploaded column feeds which field.
 *
 * Compared case- and punctuation-insensitively so "Sale Price", "sale_price"
 * and "SALEPRICE" all match. A guess is only ever a starting point — the UI
 * shows every mapping for confirmation, because a wrong guess that silently
 * imports 40 rows into the wrong column is far more expensive than one the
 * user corrects in a dropdown.
 */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ImportFieldDefinition {
  key: string;
  label: string;
  required: boolean;
  /** Header spellings this field recognises, already normalised. */
  aliases: readonly string[];
  hint?: string;
}

/** The fields a sold-property import needs. */
export const SOLD_PROPERTY_FIELDS: ReadonlyArray<ImportFieldDefinition> = [
  {
    key: "propertyName",
    label: "Property",
    required: true,
    aliases: ["property", "propertyname", "unit", "apartment", "name"],
    hint: "Matched against existing properties by name.",
  },
  {
    key: "buyerEmail",
    label: "Buyer email",
    required: true,
    aliases: ["buyeremail", "email", "clientemail", "buyer", "client"],
    hint: "Matched against existing client accounts by email.",
  },
  {
    key: "salePrice",
    label: "Sale price",
    required: false,
    aliases: ["saleprice", "price", "value", "amount", "dealvalue"],
    hint: "Blank is allowed — it records as 'not yet agreed'.",
  },
  {
    key: "saleDate",
    label: "Sale date",
    required: false,
    aliases: ["saledate", "date", "closedate", "completiondate"],
    hint: "YYYY-MM-DD or DD/MM/YYYY. Cannot be in the future.",
  },
];

/** Best-guess header → field mapping. Values are header indexes. */
export function guessMapping(
  headers: readonly string[],
  fields: readonly ImportFieldDefinition[],
): Record<string, number | null> {
  const normalised = headers.map(normalizeHeader);
  const mapping: Record<string, number | null> = {};
  const taken = new Set<number>();

  for (const field of fields) {
    const index = normalised.findIndex(
      (header, i) => !taken.has(i) && field.aliases.includes(header),
    );
    mapping[field.key] = index === -1 ? null : index;
    if (index !== -1) taken.add(index);
  }
  return mapping;
}

/**
 * Parses a money cell.
 *
 * Strips currency symbols, spaces and thousands separators, because a
 * spreadsheet exports "€250,000.00" and a plain `Number()` on that is NaN.
 * Returns null for genuinely empty, which is a real state — a sale whose
 * price is not yet agreed — and distinct from zero.
 */
export function parseMoneyCell(raw: string): number | null | "invalid" {
  const text = raw.trim();
  if (text === "") return null;

  const cleaned = text.replace(/[€$£\s]/g, "").replace(/,/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return "invalid";
  return value;
}

/**
 * Parses a date cell into ISO YYYY-MM-DD.
 *
 * Accepts ISO and DD/MM/YYYY, and **not** MM/DD/YYYY — the ambiguity is
 * unresolvable from the data alone, and this business is Greek, so 03/04/2026
 * means 3 April. Guessing per-row from whether the first number exceeds 12
 * would silently mix both conventions inside one file, which is worse than
 * being consistently wrong in a way the preview shows.
 */
export function parseDateCell(raw: string): string | null | "invalid" {
  const text = raw.trim();
  if (text === "") return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return isRealDate(text) ? text : "invalid";

  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (dmy) {
    const [, day, month, year] = dmy;
    const candidate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return isRealDate(candidate) ? candidate : "invalid";
  }

  return "invalid";
}

/** Rejects 2026-02-30, which Date.parse would roll into March. */
function isRealDate(iso: string): boolean {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === iso;
}

export interface PlannedRow {
  /** 1-based row number as the user sees it in the spreadsheet, header
   * excluded — so an error names the line they can actually go and look at. */
  lineNumber: number;
  propertyName: string;
  buyerEmail: string;
  salePrice: number | null;
  saleDate: string | null;
  /** Non-empty means this row will be skipped. */
  problems: string[];
}

export interface ImportPlan {
  rows: PlannedRow[];
  validCount: number;
  skippedCount: number;
}

/**
 * Turns parsed rows plus a mapping into a per-row plan, without touching the
 * database.
 *
 * ⚠️ EVERY ROW IS REPORTED, VALID OR NOT. An importer that stops at the first
 * bad row makes fixing a 200-row file a 200-attempt loop; one that silently
 * drops bad rows leaves the user believing an import succeeded when a third
 * of it vanished. Both failure modes are worse than a preview that lists what
 * will happen and what will not.
 */
export function buildImportPlan(
  parsed: ParsedCsv,
  mapping: Record<string, number | null>,
  now: Date = new Date(),
): ImportPlan {
  const rows: PlannedRow[] = parsed.rows.map((cells, index) => {
    const cell = (key: string): string => {
      const columnIndex = mapping[key];
      if (columnIndex === null || columnIndex === undefined) return "";
      return cells[columnIndex]?.trim() ?? "";
    };

    const problems: string[] = [];
    const propertyName = cell("propertyName");
    const buyerEmail = cell("buyerEmail").toLowerCase();

    if (!propertyName) problems.push("Property is blank.");
    if (!buyerEmail) problems.push("Buyer email is blank.");
    else if (!buyerEmail.includes("@")) problems.push(`"${buyerEmail}" is not an email address.`);

    const price = parseMoneyCell(cell("salePrice"));
    if (price === "invalid") problems.push(`"${cell("salePrice")}" is not a valid price.`);

    const date = parseDateCell(cell("saleDate"));
    if (date === "invalid") problems.push(`"${cell("saleDate")}" is not a valid date.`);
    else if (date !== null && new Date(`${date}T00:00:00Z`).getTime() > now.getTime()) {
      // Same rule the write path enforces — surfaced here so it is caught in
      // the preview rather than half way through applying the file.
      problems.push(`Sale date ${date} is in the future.`);
    }

    return {
      lineNumber: index + 1,
      propertyName,
      buyerEmail,
      salePrice: price === "invalid" ? null : price,
      saleDate: date === "invalid" ? null : date,
      problems,
    };
  });

  const validCount = rows.filter((row) => row.problems.length === 0).length;
  return { rows, validCount, skippedCount: rows.length - validCount };
}

/** Which required fields have no column mapped — checked before the plan, so
 * the user is not shown 200 identical "Property is blank" errors. */
export function missingRequiredFields(
  mapping: Record<string, number | null>,
  fields: readonly ImportFieldDefinition[],
): string[] {
  return fields
    .filter((field) => field.required && (mapping[field.key] === null || mapping[field.key] === undefined))
    .map((field) => field.label);
}
