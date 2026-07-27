import { describe, expect, it } from "vitest";
import { formatCurrency, formatCurrencyCompact, formatDate, formatProgress } from "@/lib/format";

describe("formatCurrency", () => {
  it("renders euros with cents", () => {
    expect(formatCurrency(1250.5)).toBe("€1,250.50");
  });

  it("renders zero rather than an empty string, so a settled balance still shows a figure", () => {
    expect(formatCurrency(0)).toBe("€0.00");
  });
});

describe("formatCurrencyCompact", () => {
  it("drops the cents for headline figures", () => {
    expect(formatCurrencyCompact(1250.5)).toBe("€1,251");
  });

  it("is the same value as formatCurrency, only rounded — not a different number", () => {
    // Guards against the compact formatter drifting into a "1.3K" style,
    // which would make the dashboard disagree with the table it links to.
    expect(formatCurrencyCompact(425000)).toBe("€425,000");
  });
});

describe("formatDate", () => {
  it("renders an ISO date in the app's en-GB day/month/year style", () => {
    expect(formatDate("2026-03-14")).toBe("14 Mar 2026");
  });

  it("accepts a full ISO timestamp, not just a date-only string", () => {
    expect(formatDate("2026-03-14T09:30:00.000Z")).toBe("14 Mar 2026");
  });

  it("returns the placeholder for null, since 'not recorded' is an expected state here", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns the placeholder rather than 'Invalid Date' for unparseable input", () => {
    // "Invalid Date" reads as a bug; the placeholder reads as missing data,
    // which is what it actually is.
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("honours a custom placeholder, which callers use to opt into their own empty state", () => {
    expect(formatDate(null, "")).toBe("");
  });

  it("treats an empty string as absent", () => {
    expect(formatDate("")).toBe("—");
  });
});

describe("formatProgress", () => {
  it("renders the shared 'n of m' phrasing", () => {
    expect(formatProgress(3, 10)).toBe("3 of 10");
  });

  it("renders a zero denominator literally, leaving the caller to decide what that means", () => {
    expect(formatProgress(0, 0)).toBe("0 of 0");
  });
});
