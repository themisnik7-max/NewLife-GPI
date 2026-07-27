import { describe, expect, it } from "vitest";
import { toDisplayName, toInitials } from "@/lib/clientName";

describe("toDisplayName", () => {
  it("joins first and last name", () => {
    expect(toDisplayName("Maria", "Papadopoulos", "m@example.com")).toBe("Maria Papadopoulos");
  });

  it("falls back to the email when Clerk synced no name at all", () => {
    // Clerk permits an email-only user; the email is then the only real
    // identifier an admin has, so a placeholder like "Unknown" would be
    // strictly less useful.
    expect(toDisplayName(null, null, "nameless@example.com")).toBe("nameless@example.com");
  });

  it.each([
    [null, "Papadopoulos", "Papadopoulos"],
    ["Maria", null, "Maria"],
    [undefined, undefined, "m@example.com"],
  ])("handles a missing half: (%s, %s)", (first, last, expected) => {
    expect(toDisplayName(first, last, "m@example.com")).toBe(expected);
  });

  it("falls back to the email when both names are whitespace, not to a blank string", () => {
    // A row whose name columns hold " " would otherwise render an empty cell
    // that reads as a rendering bug rather than as missing data.
    expect(toDisplayName(" ", " ", "m@example.com")).toBe("m@example.com");
  });
});

describe("toInitials", () => {
  it("takes the first and last word's initials", () => {
    expect(toInitials("Maria Papadopoulos")).toBe("MP");
  });

  it("uses the first and LAST word, not the first two, for a three-part name", () => {
    expect(toInitials("Anna Maria Papadopoulos")).toBe("AP");
  });

  it("returns a single letter for a one-word name", () => {
    expect(toInitials("Maria")).toBe("M");
  });

  it("skips punctuation so an email yields letters, not a dot", () => {
    expect(toInitials("j.doe@example.com")).toBe("JC");
  });

  it("returns a question mark rather than an empty badge when there are no letters", () => {
    expect(toInitials("...")).toBe("?");
  });

  it("handles non-Latin letters, which a [a-z] character class would drop", () => {
    expect(toInitials("Θέμης Νικολάου")).toBe("ΘΝ");
  });
});
