import { describe, expect, it } from "vitest";

import {
  AUTOMATION_ACTIONS,
  AUTOMATION_TRIGGERS,
  SUBJECT_PLACEHOLDER,
  isKnownAction,
  isKnownTrigger,
  isStalled,
  renderMessage,
  triggerLabel,
  validateRule,
} from "@/lib/automations";

const NOW = new Date("2026-07-29T12:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("vocabulary", () => {
  it("recognises every canonical trigger and action, and rejects others", () => {
    for (const trigger of AUTOMATION_TRIGGERS) {
      expect(isKnownTrigger(trigger.key)).toBe(true);
    }
    for (const action of AUTOMATION_ACTIONS) {
      expect(isKnownAction(action.key)).toBe(true);
    }
    expect(isKnownTrigger("SEND_CARRIER_PIGEON")).toBe(false);
    expect(isKnownAction("DELETE_EVERYTHING")).toBe(false);
  });

  it("has no duplicate trigger keys", () => {
    const keys = AUTOMATION_TRIGGERS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every threshold trigger a sensible default", () => {
    for (const trigger of AUTOMATION_TRIGGERS.filter((t) => t.usesThreshold)) {
      expect(trigger.defaultThresholdDays).toBeGreaterThan(0);
    }
  });

  it("labels a known trigger and falls back to the raw key", () => {
    expect(triggerLabel("DEAL_STALLED")).toBe("A deal stops moving");
    expect(triggerLabel("MYSTERY")).toBe("MYSTERY");
  });
});

describe("isStalled", () => {
  it("is inclusive at the threshold", () => {
    expect(isStalled(daysAgo(14), 14, NOW)).toBe(true);
    expect(isStalled(daysAgo(13), 14, NOW)).toBe(false);
  });

  it("is true well past the threshold and false for something just touched", () => {
    expect(isStalled(daysAgo(90), 14, NOW)).toBe(true);
    expect(isStalled(NOW, 14, NOW)).toBe(false);
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(isStalled(daysAgo(20).toISOString(), 14, NOW)).toBe(true);
  });

  it("is false for a future timestamp rather than throwing", () => {
    const future = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(isStalled(future, 1, NOW)).toBe(false);
  });
});

describe("renderMessage", () => {
  it("substitutes the subject", () => {
    expect(renderMessage(`Chase ${SUBJECT_PLACEHOLDER} — no movement.`, "2-bed in Athens")).toBe(
      "Chase 2-bed in Athens — no movement.",
    );
  });

  it("replaces every occurrence, not just the first", () => {
    expect(renderMessage("{{subject}} / {{subject}}", "X")).toBe("X / X");
  });

  it("uses a template with no placeholder verbatim", () => {
    // Someone who wrote a message without it meant it — appending the
    // subject anyway would rewrite their words.
    expect(renderMessage("Weekly pipeline review is due.", "ignored")).toBe(
      "Weekly pipeline review is due.",
    );
  });

  it("copes with an empty subject", () => {
    expect(renderMessage("Chase {{subject}}.", "")).toBe("Chase .");
  });
});

describe("validateRule", () => {
  const VALID = {
    name: "Chase stalled deals",
    trigger: "DEAL_STALLED",
    thresholdDays: 14,
    action: "NOTIFY",
    messageTemplate: "Chase {{subject}}.",
  };

  it("accepts a well-formed rule", () => {
    expect(validateRule(VALID)).toEqual([]);
  });

  it("reports every problem at once rather than the first", () => {
    // A form that surfaces one issue per submit makes the author fix them
    // one round trip at a time.
    const problems = validateRule({
      name: "  ",
      trigger: "NONSENSE",
      thresholdDays: null,
      action: "EXPLODE",
      messageTemplate: "",
    });

    expect(problems.length).toBeGreaterThanOrEqual(4);
  });

  it("requires a positive whole number of days for a threshold trigger", () => {
    expect(validateRule({ ...VALID, thresholdDays: null })).toContainEqual(
      expect.stringMatching(/positive whole number/),
    );
    expect(validateRule({ ...VALID, thresholdDays: 0 })).toContainEqual(
      expect.stringMatching(/positive whole number/),
    );
    expect(validateRule({ ...VALID, thresholdDays: -5 })).toContainEqual(
      expect.stringMatching(/positive whole number/),
    );
    expect(validateRule({ ...VALID, thresholdDays: 2.5 })).toContainEqual(
      expect.stringMatching(/positive whole number/),
    );
  });

  it("does not require a threshold for a trigger that takes none", () => {
    expect(
      validateRule({ ...VALID, trigger: "PAYMENT_OVERDUE", thresholdDays: null }),
    ).toEqual([]);
  });

  it("requires a name and a message", () => {
    expect(validateRule({ ...VALID, name: "   " })).toContainEqual(expect.stringMatching(/name/));
    expect(validateRule({ ...VALID, messageTemplate: "  " })).toContainEqual(
      expect.stringMatching(/message/),
    );
  });
});
