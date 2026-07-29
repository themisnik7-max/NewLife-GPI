import { describe, expect, it } from "vitest";

import {
  ACTIVITY_TYPES,
  activityLabelFor,
  humanizeAuditValue,
  humanizeFieldName,
  isKnownActivityType,
  isOverdueTask,
  sortTimeline,
  summarizeAuditEntry,
  timelineTimestampFor,
  type ActivityView,
  type TimelineEntry,
} from "@/lib/activities";

function makeActivity(overrides: Partial<ActivityView> = {}): ActivityView {
  return {
    id: "a1",
    entityType: "User",
    entityId: "user_1",
    type: "CALL",
    typeLabel: "Call",
    subject: "Discussed the offer",
    body: null,
    occurredAt: "2026-07-20T09:00:00.000Z",
    dueAt: null,
    completedAt: null,
    visibleToClient: false,
    createdByUserId: "user_admin",
    createdByName: "Themis",
    createdAt: "2026-07-23T09:00:00.000Z",
    ...overrides,
  };
}

describe("activity types", () => {
  it("recognises the five canonical types and rejects anything else", () => {
    for (const type of ACTIVITY_TYPES) {
      expect(isKnownActivityType(type.key)).toBe(true);
    }
    expect(isKnownActivityType("SMS")).toBe(false);
  });

  it("labels a known type and falls back to the raw key otherwise", () => {
    expect(activityLabelFor("MEETING")).toBe("Meeting");
    expect(activityLabelFor("MYSTERY")).toBe("MYSTERY");
  });
});

describe("timelineTimestampFor", () => {
  it("files an entry under when it happened, not when it was typed", () => {
    // The whole reason occurredAt is a separate column: someone logging
    // Friday's call on Monday needs it to appear on Friday.
    const activity = makeActivity({
      occurredAt: "2026-07-20T09:00:00.000Z",
      createdAt: "2026-07-23T09:00:00.000Z",
    });

    expect(timelineTimestampFor(activity)).toBe("2026-07-20T09:00:00.000Z");
  });

  it("files a task under its due date", () => {
    const task = makeActivity({
      type: "TASK",
      occurredAt: null,
      dueAt: "2026-08-01T09:00:00.000Z",
    });

    expect(timelineTimestampFor(task)).toBe("2026-08-01T09:00:00.000Z");
  });

  it("falls back to createdAt so an entry always has a position", () => {
    const orphan = makeActivity({ occurredAt: null, dueAt: null });

    expect(timelineTimestampFor(orphan)).toBe("2026-07-23T09:00:00.000Z");
  });
});

describe("isOverdueTask", () => {
  const now = new Date("2026-07-29T12:00:00.000Z");

  it("flags an incomplete task past its due date", () => {
    const task = makeActivity({ type: "TASK", occurredAt: null, dueAt: "2026-07-20T09:00:00.000Z" });
    expect(isOverdueTask(task, now)).toBe(true);
  });

  it("does not flag a completed one", () => {
    const task = makeActivity({
      type: "TASK",
      occurredAt: null,
      dueAt: "2026-07-20T09:00:00.000Z",
      completedAt: "2026-07-21T09:00:00.000Z",
    });
    expect(isOverdueTask(task, now)).toBe(false);
  });

  it("does not flag a future task, or a non-task", () => {
    expect(
      isOverdueTask(makeActivity({ type: "TASK", occurredAt: null, dueAt: "2026-08-30T09:00:00.000Z" }), now),
    ).toBe(false);
    // A call cannot be overdue — it either happened or it did not.
    expect(isOverdueTask(makeActivity({ type: "CALL" }), now)).toBe(false);
  });
});

describe("sortTimeline", () => {
  it("interleaves both kinds strictly by time, newest first", () => {
    const entries: TimelineEntry[] = [
      { kind: "activity", at: "2026-07-20T09:00:00.000Z", activity: makeActivity() },
      { kind: "system", at: "2026-07-25T09:00:00.000Z", id: "s1", summary: "x", actorName: "A" },
      { kind: "activity", at: "2026-07-22T09:00:00.000Z", activity: makeActivity({ id: "a2" }) },
    ];

    expect(sortTimeline(entries).map((entry) => entry.at)).toEqual([
      "2026-07-25T09:00:00.000Z",
      "2026-07-22T09:00:00.000Z",
      "2026-07-20T09:00:00.000Z",
    ]);
  });

  it("does not mutate its input", () => {
    const entries: TimelineEntry[] = [
      { kind: "system", at: "2026-07-20T09:00:00.000Z", id: "s1", summary: "x", actorName: "A" },
      { kind: "system", at: "2026-07-25T09:00:00.000Z", id: "s2", summary: "y", actorName: "B" },
    ];
    const originalOrder = entries.map((entry) => entry.at);

    sortTimeline(entries);

    expect(entries.map((entry) => entry.at)).toEqual(originalOrder);
  });
});

describe("humanizeFieldName", () => {
  it("uses the curated label where there is one", () => {
    expect(humanizeFieldName("visibleToClient")).toBe("client visibility");
    expect(humanizeFieldName("salePrice")).toBe("sale price");
  });

  it("de-camel-cases anything unlisted, so a newly audited column still reads", () => {
    expect(humanizeFieldName("someNewColumn")).toBe("some new column");
    expect(humanizeFieldName("snake_case_column")).toBe("snake case column");
  });
});

describe("humanizeAuditValue", () => {
  it("renders stored booleans as words", () => {
    // Audit values are stringified on write, so everything arriving is text.
    expect(humanizeAuditValue("true")).toBe("yes");
    expect(humanizeAuditValue("false")).toBe("no");
  });

  it("renders an absent value as 'empty' rather than blank", () => {
    expect(humanizeAuditValue(null)).toBe("empty");
    expect(humanizeAuditValue("")).toBe("empty");
  });

  it("sentence-cases enum-shaped values", () => {
    expect(humanizeAuditValue("IN_PROGRESS")).toBe("In progress");
    expect(humanizeAuditValue("DONE")).toBe("Done");
  });

  it("leaves free text and numbers alone", () => {
    expect(humanizeAuditValue("1450.00")).toBe("1450.00");
    expect(humanizeAuditValue("Signed original")).toBe("Signed original");
  });
});

describe("summarizeAuditEntry", () => {
  it("describes a create and a delete", () => {
    expect(
      summarizeAuditEntry({ action: "CREATE", entityType: "property", field: null, oldValue: null, newValue: null }),
    ).toBe("created this property");
    expect(
      summarizeAuditEntry({ action: "DELETE", entityType: "document", field: null, oldValue: null, newValue: null }),
    ).toBe("deleted this document");
  });

  it("describes a field change with both values", () => {
    expect(
      summarizeAuditEntry({
        action: "UPDATE",
        entityType: "rental stage",
        field: "status",
        oldValue: "PENDING",
        newValue: "DONE",
      }),
    ).toBe("changed status from Pending to Done");
  });

  it("says 'set' rather than 'changed from empty' when a field is first filled in", () => {
    expect(
      summarizeAuditEntry({
        action: "UPDATE",
        entityType: "ownership",
        field: "salePrice",
        oldValue: null,
        newValue: "250000",
      }),
    ).toBe("set sale price to 250000");
  });

  it("says 'cleared' when a value is removed", () => {
    expect(
      summarizeAuditEntry({
        action: "UPDATE",
        entityType: "ownership",
        field: "saleDate",
        oldValue: "2026-01-01",
        newValue: null,
      }),
    ).toBe("cleared sale date");
  });

  it("degrades to a generic sentence for an update with no field recorded", () => {
    expect(
      summarizeAuditEntry({ action: "UPDATE", entityType: "client", field: null, oldValue: null, newValue: null }),
    ).toBe("updated this client");
  });
});
