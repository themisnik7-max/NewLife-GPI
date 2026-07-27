import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { AuditAction, getAuditTrail, recordAuditEvent, recordFieldChanges } from "@/lib/data/audit";
import { prisma } from "@/lib/prisma";

const mockedCreate = vi.mocked(prisma.auditLog.create);
const mockedFindMany = vi.mocked(prisma.auditLog.findMany);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const BASE = {
  tenantId: TENANT_A,
  actorUserId: "user_admin",
  entityType: "Property",
  entityId: "prop-1",
};

beforeEach(() => {
  mockedCreate.mockReset().mockResolvedValue({} as never);
  mockedFindMany.mockReset();
});

describe("recordAuditEvent", () => {
  it("writes a row with the actor, entity, and action", async () => {
    await recordAuditEvent(prisma, { ...BASE, action: AuditAction.CREATE });

    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_A,
        actorUserId: "user_admin",
        entityType: "Property",
        entityId: "prop-1",
        action: "CREATE",
      }),
    });
  });

  it("stringifies values so one table can span every model", async () => {
    await recordAuditEvent(prisma, {
      ...BASE,
      action: AuditAction.UPDATE,
      field: "availableUnits",
      oldValue: 5,
      newValue: 3,
    });

    const { data } = mockedCreate.mock.calls[0][0];
    expect(data.oldValue).toBe("5");
    expect(data.newValue).toBe("3");
  });

  it("preserves null/undefined as SQL NULL rather than the strings 'null'/'undefined'", async () => {
    // A literal "null" string would be indistinguishable from a real value
    // during analysis, which is the whole point of this table.
    await recordAuditEvent(prisma, {
      ...BASE,
      action: AuditAction.UPDATE,
      field: "pptUrl",
      oldValue: null,
      newValue: undefined,
    });

    const { data } = mockedCreate.mock.calls[0][0];
    expect(data.oldValue).toBeNull();
    expect(data.newValue).toBeNull();
  });

  it("serialises Dates to ISO so they sort and parse predictably", async () => {
    await recordAuditEvent(prisma, {
      ...BASE,
      action: AuditAction.UPDATE,
      field: "completedAt",
      newValue: new Date("2026-07-27T10:30:00.000Z"),
    });

    expect(mockedCreate.mock.calls[0][0].data.newValue).toBe("2026-07-27T10:30:00.000Z");
  });

  it("JSON-encodes object values", async () => {
    await recordAuditEvent(prisma, {
      ...BASE,
      action: AuditAction.UPDATE,
      field: "meta",
      newValue: { a: 1 },
    });

    expect(mockedCreate.mock.calls[0][0].data.newValue).toBe('{"a":1}');
  });

  it.each([
    ["an unrecognized action", { ...BASE, action: "ARCHIVE" as never }, /Unrecognized audit action/],
    ["an empty entityType", { ...BASE, entityType: "  ", action: AuditAction.CREATE }, /entityType must not be empty/],
    ["an empty entityId", { ...BASE, entityId: "", action: AuditAction.CREATE }, /entityId must not be empty/],
  ])("rejects %s without writing", async (_label, input, expected) => {
    await expect(recordAuditEvent(prisma, input)).rejects.toThrow(expected);
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe("recordFieldChanges", () => {
  it("writes one row per field that actually changed", async () => {
    await recordFieldChanges(
      prisma,
      BASE,
      { name: "Old", availableUnits: 5 },
      { name: "New", availableUnits: 3 },
    );

    expect(mockedCreate).toHaveBeenCalledTimes(2);
  });

  it("skips fields whose value is unchanged, so no-op writes don't pollute the trail", async () => {
    // A "set status to DONE" row for something already DONE would distort any
    // later "when did this happen" analysis built on this table.
    await recordFieldChanges(prisma, BASE, { status: "DONE" }, { status: "DONE" });

    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("compares stringified values, so 5 and \"5\" count as unchanged", async () => {
    await recordFieldChanges(prisma, BASE, { units: 5 }, { units: "5" });

    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("only considers keys present in `after`, so a partial update ignores untouched fields", async () => {
    await recordFieldChanges(prisma, BASE, { name: "Old", area: "Paros" }, { name: "New" });

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedCreate.mock.calls[0][0].data.field).toBe("name");
  });

  it("records each change as an UPDATE with both old and new values", async () => {
    await recordFieldChanges(prisma, BASE, { status: "PENDING" }, { status: "DONE" });

    expect(mockedCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATE",
        field: "status",
        oldValue: "PENDING",
        newValue: "DONE",
      }),
    });
  });
});

describe("getAuditTrail", () => {
  const ROW = {
    id: "audit-1",
    tenantId: TENANT_A,
    actorUserId: "user_admin",
    entityType: "Property",
    entityId: "prop-1",
    action: "UPDATE",
    field: "status",
    oldValue: "PLANNING",
    newValue: "COMPLETED",
    metadata: null,
    createdAt: new Date("2026-07-27T10:00:00.000Z"),
  };

  it("scopes to the tenant and returns most recent first", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    await getAuditTrail(TENANT_A);

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  });

  it("narrows to a single entity when asked", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    await getAuditTrail(TENANT_A, { entityType: "Property", entityId: "prop-1", limit: 5 });

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A, entityType: "Property", entityId: "prop-1" },
        take: 5,
      }),
    );
  });

  it("maps createdAt to an ISO string for the client boundary", async () => {
    mockedFindMany.mockResolvedValueOnce([ROW] as never);

    const result = await getAuditTrail(TENANT_A);

    expect(result[0].createdAt).toBe("2026-07-27T10:00:00.000Z");
    expect(result[0].action).toBe("UPDATE");
  });
});
