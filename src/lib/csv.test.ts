import { describe, expect, it } from "vitest";

import {
  SOLD_PROPERTY_FIELDS,
  buildImportPlan,
  guessMapping,
  missingRequiredFields,
  normalizeHeader,
  parseDateCell,
  parseMoneyCell,
  readCsv,
} from "@/lib/csv";

const NOW = new Date("2026-07-29T12:00:00.000Z");

describe("readCsv", () => {
  it("reads a plain file", () => {
    const parsed = readCsv("Property,Email\nAegean Court,maria@example.com");

    expect(parsed.headers).toEqual(["Property", "Email"]);
    expect(parsed.rows).toEqual([["Aegean Court", "maria@example.com"]]);
  });

  it("keeps a comma inside a quoted field", () => {
    // The naive split(",") version corrupts any row with an address in it,
    // which is most of them.
    const parsed = readCsv('Property,Address\n"Aegean Court","12 Main St, Athens"');

    expect(parsed.rows[0]).toEqual(["Aegean Court", "12 Main St, Athens"]);
  });

  it("keeps a newline inside a quoted field", () => {
    const parsed = readCsv('Name,Notes\n"A","line one\nline two"');

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0][1]).toBe("line one\nline two");
  });

  it("treats a doubled quote as one literal quote", () => {
    const parsed = readCsv('Name\n"The ""Blue"" Villa"');

    expect(parsed.rows[0][0]).toBe('The "Blue" Villa');
  });

  it("strips the BOM Excel writes, which would otherwise break header matching", () => {
    // Without this, "Property" silently fails to match "﻿Property".
    const parsed = readCsv("﻿Property,Email\nA,b@c.com");

    expect(parsed.headers[0]).toBe("Property");
  });

  it("handles CRLF as well as LF", () => {
    const parsed = readCsv("Property,Email\r\nAegean Court,maria@example.com\r\n");

    expect(parsed.headers).toEqual(["Property", "Email"]);
    expect(parsed.rows).toEqual([["Aegean Court", "maria@example.com"]]);
  });

  it("does not invent a trailing empty row for a file ending in a newline", () => {
    expect(readCsv("A,B\n1,2\n").rows).toHaveLength(1);
    expect(readCsv("A,B\n1,2").rows).toHaveLength(1);
  });

  it("drops blank lines that spreadsheets export", () => {
    const parsed = readCsv("A,B\n1,2\n\n\n3,4\n\n");

    expect(parsed.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("returns empty for an empty or whitespace-only file", () => {
    expect(readCsv("")).toEqual({ headers: [], rows: [] });
    expect(readCsv("\n\n")).toEqual({ headers: [], rows: [] });
  });

  it("trims header whitespace but not cell content", () => {
    const parsed = readCsv(" Property , Email \nAegean Court, maria@example.com");

    expect(parsed.headers).toEqual(["Property", "Email"]);
    // Cells are trimmed later, per field, so a deliberately padded value is
    // still visible in the preview.
    expect(parsed.rows[0][1]).toBe(" maria@example.com");
  });

  it("supports a semicolon delimiter, which Excel uses in European locales", () => {
    const parsed = readCsv("Property;Email\nAegean Court;maria@example.com", ";");

    expect(parsed.rows[0]).toEqual(["Aegean Court", "maria@example.com"]);
  });

  it("preserves a ragged row rather than padding or rejecting the file", () => {
    // One malformed line should name itself in the preview, not fail
    // everything around it.
    const parsed = readCsv("A,B,C\n1,2\n4,5,6");

    expect(parsed.rows[0]).toHaveLength(2);
    expect(parsed.rows[1]).toHaveLength(3);
  });
});

describe("guessMapping", () => {
  it("matches ignoring case and punctuation", () => {
    const mapping = guessMapping(
      ["Property Name", "BUYER_EMAIL", "Sale Price"],
      SOLD_PROPERTY_FIELDS,
    );

    expect(mapping.propertyName).toBe(0);
    expect(mapping.buyerEmail).toBe(1);
    expect(mapping.salePrice).toBe(2);
  });

  it("leaves a field unmapped when nothing matches", () => {
    const mapping = guessMapping(["Property", "Email"], SOLD_PROPERTY_FIELDS);
    expect(mapping.saleDate).toBeNull();
  });

  it("never assigns one column to two fields", () => {
    // "name" is an alias of propertyName; nothing else may also claim it.
    const mapping = guessMapping(["name"], SOLD_PROPERTY_FIELDS);
    const used = Object.values(mapping).filter((v) => v !== null);
    expect(new Set(used).size).toBe(used.length);
  });

  it("normalises headers consistently", () => {
    expect(normalizeHeader("Sale Price")).toBe("saleprice");
    expect(normalizeHeader("sale_price")).toBe("saleprice");
    expect(normalizeHeader("SALE-PRICE")).toBe("saleprice");
  });
});

describe("parseMoneyCell", () => {
  it("strips currency symbols and thousands separators", () => {
    // A spreadsheet exports "€250,000.00" and plain Number() on that is NaN.
    expect(parseMoneyCell("€250,000.00")).toBe(250000);
    expect(parseMoneyCell("250000")).toBe(250000);
    expect(parseMoneyCell("$1,500")).toBe(1500);
  });

  it("treats blank as 'not yet agreed', which is distinct from zero", () => {
    expect(parseMoneyCell("")).toBeNull();
    expect(parseMoneyCell("   ")).toBeNull();
    expect(parseMoneyCell("0")).toBe(0);
  });

  it("rejects text and negatives", () => {
    expect(parseMoneyCell("about 250k")).toBe("invalid");
    expect(parseMoneyCell("-5000")).toBe("invalid");
  });
});

describe("parseDateCell", () => {
  it("accepts ISO", () => {
    expect(parseDateCell("2026-06-01")).toBe("2026-06-01");
  });

  it("reads slash dates as day-first, not month-first", () => {
    // Unresolvable from the data alone, and this is a Greek business —
    // 03/04/2026 is 3 April. Guessing per row from whether the first number
    // exceeds 12 would mix both conventions inside one file.
    expect(parseDateCell("03/04/2026")).toBe("2026-04-03");
    expect(parseDateCell("25/12/2026")).toBe("2026-12-25");
  });

  it("accepts dots and dashes as separators", () => {
    expect(parseDateCell("01.06.2026")).toBe("2026-06-01");
    expect(parseDateCell("01-06-2026")).toBe("2026-06-01");
  });

  it("treats blank as not recorded", () => {
    expect(parseDateCell("")).toBeNull();
  });

  it("rejects a date that does not exist", () => {
    // Date.parse would silently roll this into March.
    expect(parseDateCell("2026-02-30")).toBe("invalid");
    expect(parseDateCell("31/02/2026")).toBe("invalid");
  });

  it("rejects unparseable text", () => {
    expect(parseDateCell("last June")).toBe("invalid");
    expect(parseDateCell("2026")).toBe("invalid");
  });
});

describe("buildImportPlan", () => {
  const MAPPING = { propertyName: 0, buyerEmail: 1, salePrice: 2, saleDate: 3 };

  function plan(rows: string[][]) {
    return buildImportPlan(
      { headers: ["Property", "Email", "Price", "Date"], rows },
      MAPPING,
      NOW,
    );
  }

  it("accepts a well-formed row", () => {
    const result = plan([["Aegean Court", "maria@example.com", "€250,000", "01/06/2026"]]);

    expect(result.validCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      propertyName: "Aegean Court",
      buyerEmail: "maria@example.com",
      salePrice: 250000,
      saleDate: "2026-06-01",
      problems: [],
    });
  });

  it("reports EVERY row, valid or not, rather than stopping at the first bad one", () => {
    // Stopping makes fixing a 200-row file a 200-attempt loop; dropping bad
    // rows silently leaves the user believing it all imported.
    const result = plan([
      ["Aegean Court", "maria@example.com", "250000", ""],
      ["", "bad-email", "nonsense", "not a date"],
      ["Villa Elytra", "li@example.com", "", ""],
    ]);

    expect(result.rows).toHaveLength(3);
    expect(result.validCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.rows[1].problems.length).toBeGreaterThanOrEqual(3);
  });

  it("numbers rows as the user sees them in the spreadsheet", () => {
    const result = plan([["A", "a@b.com", "", ""], ["B", "b@c.com", "", ""]]);

    expect(result.rows.map((r) => r.lineNumber)).toEqual([1, 2]);
  });

  it("lower-cases the buyer email so matching is not defeated by typing", () => {
    const result = plan([["Aegean Court", "Maria@Example.COM", "", ""]]);

    expect(result.rows[0].buyerEmail).toBe("maria@example.com");
  });

  it("allows a blank price and date — both are real states", () => {
    const result = plan([["Aegean Court", "maria@example.com", "", ""]]);

    expect(result.validCount).toBe(1);
    expect(result.rows[0].salePrice).toBeNull();
    expect(result.rows[0].saleDate).toBeNull();
  });

  it("catches a future sale date in the preview, not half way through applying", () => {
    const result = plan([["Aegean Court", "maria@example.com", "", "01/06/2099"]]);

    expect(result.validCount).toBe(0);
    expect(result.rows[0].problems[0]).toMatch(/in the future/);
  });

  it("names a missing property and a malformed email specifically", () => {
    const result = plan([["", "not-an-email", "", ""]]);

    expect(result.rows[0].problems).toContain("Property is blank.");
    expect(result.rows[0].problems.some((p) => p.includes("not an email"))).toBe(true);
  });

  it("copes with a ragged row missing trailing cells", () => {
    const result = plan([["Aegean Court", "maria@example.com"]]);

    expect(result.validCount).toBe(1);
    expect(result.rows[0].salePrice).toBeNull();
  });

  it("treats an unmapped optional column as blank rather than throwing", () => {
    const result = buildImportPlan(
      { headers: ["Property", "Email"], rows: [["Aegean Court", "maria@example.com"]] },
      { propertyName: 0, buyerEmail: 1, salePrice: null, saleDate: null },
      NOW,
    );

    expect(result.validCount).toBe(1);
  });
});

describe("missingRequiredFields", () => {
  it("names required fields with no column mapped", () => {
    // Checked before the plan, so the user is not shown 200 identical
    // "Property is blank" errors.
    const missing = missingRequiredFields(
      { propertyName: null, buyerEmail: 1, salePrice: null, saleDate: null },
      SOLD_PROPERTY_FIELDS,
    );

    expect(missing).toEqual(["Property"]);
  });

  it("is empty when every required field is mapped", () => {
    expect(
      missingRequiredFields(
        { propertyName: 0, buyerEmail: 1, salePrice: null, saleDate: null },
        SOLD_PROPERTY_FIELDS,
      ),
    ).toEqual([]);
  });

  it("does not complain about unmapped optional fields", () => {
    const missing = missingRequiredFields(
      { propertyName: 0, buyerEmail: 1, salePrice: null, saleDate: null },
      SOLD_PROPERTY_FIELDS,
    );
    expect(missing).not.toContain("Sale price");
  });
});
