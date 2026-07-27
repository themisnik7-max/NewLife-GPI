import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: vi.fn() },
    rentalStageRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  attachRentalStageFile,
  getClientRentalStages,
  getRentalStageAttachmentPath,
  getRentalStageProgress,
  setOfferDetails,
  setRentalStageStatus,
} from "@/lib/data/rentalStages";
import { RENTAL_STAGES } from "@/lib/rentalStages";
import { prisma } from "@/lib/prisma";

const mockedFindMany = vi.mocked(prisma.rentalStageRecord.findMany);
const mockedFindFirst = vi.mocked(prisma.rentalStageRecord.findFirst);
const mockedCount = vi.mocked(prisma.rentalStageRecord.count);
const mockedUpsert = vi.mocked(prisma.rentalStageRecord.upsert);
const mockedAudit = vi.mocked(prisma.auditLog.create);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const USER_1 = "user_client1";
const ACTOR = { tenantId: TENANT_A, actorUserId: "user_admin" };

beforeEach(() => {
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (tx: unknown) => unknown) => cb(prisma)) as never);
  mockedFindMany.mockReset();
  mockedFindFirst.mockReset();
  mockedCount.mockReset();
  mockedUpsert.mockReset().mockResolvedValue({} as never);
  mockedAudit.mockReset().mockResolvedValue({} as never);
});

describe("getClientRentalStages", () => {
  it("returns all ten canonical stages in order even when nothing is stored", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    const result = await getClientRentalStages(TENANT_A, USER_1);

    expect(result).toHaveLength(RENTAL_STAGES.length);
    expect(result.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result[0].label).toBe("Representation Mandate Signed");
    expect(result[9].label).toBe("Broker's Fee Paid");
  });

  it("treats a stage with no stored row as PENDING — absence IS the pending state", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    const result = await getClientRentalStages(TENANT_A, USER_1);

    expect(result.every((stage) => stage.status === "PENDING")).toBe(true);
  });

  it("merges stored progress onto the canonical definition", async () => {
    mockedFindMany.mockResolvedValueOnce([
      {
        stageKey: "KEYS_DELIVERED",
        status: "DONE",
        completedAt: new Date("2026-07-01T00:00:00.000Z"),
        attachmentPath: null,
        attachmentFilename: null,
        offerPrice: null,
        offerDurationMonths: null,
        offerComments: null,
      },
    ] as never);

    const result = await getClientRentalStages(TENANT_A, USER_1);
    const keys = result.find((stage) => stage.key === "KEYS_DELIVERED");

    expect(keys?.status).toBe("DONE");
    expect(keys?.completedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("exposes only whether an attachment exists, never its storage path", async () => {
    // The bucket is private; a path in the client payload would be an
    // unnecessary disclosure since downloads go through signed URLs.
    mockedFindMany.mockResolvedValueOnce([
      {
        stageKey: "ENERGY_CERTIFICATE",
        status: "PENDING",
        completedAt: null,
        attachmentPath: "tenant/user/ENERGY_CERTIFICATE-1.pdf",
        attachmentFilename: "epc.pdf",
        offerPrice: null,
        offerDurationMonths: null,
        offerComments: null,
      },
    ] as never);

    const result = await getClientRentalStages(TENANT_A, USER_1);
    const stage = result.find((s) => s.key === "ENERGY_CERTIFICATE");

    expect(stage?.hasAttachment).toBe(true);
    expect(stage?.attachmentFilename).toBe("epc.pdf");
    expect(JSON.stringify(result)).not.toContain("tenant/user/ENERGY_CERTIFICATE-1.pdf");
  });

  it("converts a Decimal offer price to a plain number", async () => {
    mockedFindMany.mockResolvedValueOnce([
      {
        stageKey: "OFFER",
        status: "PENDING",
        completedAt: null,
        attachmentPath: null,
        attachmentFilename: null,
        offerPrice: "1500.50",
        offerDurationMonths: 12,
        offerComments: "Includes parking",
      },
    ] as never);

    const result = await getClientRentalStages(TENANT_A, USER_1);
    const offer = result.find((s) => s.key === "OFFER");

    expect(offer?.offerPrice).toBe(1500.5);
    expect(offer?.offerDurationMonths).toBe(12);
  });

  it("ignores stored rows whose stageKey is no longer canonical, rather than throwing", async () => {
    // The stage list is business process and will change; a retired stage
    // must not break every page that reads rental progress.
    mockedFindMany.mockResolvedValueOnce([
      { stageKey: "A_RETIRED_STAGE", status: "DONE", completedAt: null, attachmentPath: null, attachmentFilename: null, offerPrice: null, offerDurationMonths: null, offerComments: null },
    ] as never);

    const result = await getClientRentalStages(TENANT_A, USER_1);

    expect(result).toHaveLength(RENTAL_STAGES.length);
    expect(result.every((stage) => stage.status === "PENDING")).toBe(true);
  });

  it("throws on an unrecognized status value from the database", async () => {
    mockedFindMany.mockResolvedValueOnce([
      { stageKey: "VIEWINGS", status: "MAYBE", completedAt: null, attachmentPath: null, attachmentFilename: null, offerPrice: null, offerDurationMonths: null, offerComments: null },
    ] as never);

    await expect(getClientRentalStages(TENANT_A, USER_1)).rejects.toThrow(/Unrecognized rental stage status/);
  });
});

describe("getRentalStageProgress", () => {
  it("counts only DONE stages against the canonical total", async () => {
    mockedCount.mockResolvedValueOnce(3 as never);

    const result = await getRentalStageProgress(TENANT_A, USER_1);

    expect(mockedCount).toHaveBeenCalledWith({ where: { tenantId: TENANT_A, userId: USER_1, status: "DONE" } });
    expect(result).toEqual({ completed: 3, total: 10 });
  });
});

describe("setRentalStageStatus", () => {
  it("upserts, since a stage has no row until something happens to it", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await setRentalStageStatus(ACTOR, USER_1, "KEYS_DELIVERED", "DONE");

    const args = mockedUpsert.mock.calls[0][0];
    expect(args.where).toEqual({ userId_stageKey: { userId: USER_1, stageKey: "KEYS_DELIVERED" } });
    expect(args.create).toMatchObject({ tenantId: TENANT_A, userId: USER_1, stageKey: "KEYS_DELIVERED", stageOrder: 3, status: "DONE" });
  });

  it("stamps completedAt on DONE and clears it otherwise", async () => {
    mockedFindFirst.mockResolvedValueOnce({ status: "DONE" } as never);

    await setRentalStageStatus(ACTOR, USER_1, "VIEWINGS", "PENDING");

    expect(mockedUpsert.mock.calls[0][0].update.completedAt).toBeNull();
  });

  it("records the transition in the audit trail", async () => {
    mockedFindFirst.mockResolvedValueOnce({ status: "PENDING" } as never);

    await setRentalStageStatus(ACTOR, USER_1, "VIEWINGS", "DONE");

    expect(mockedAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "RentalStageRecord",
        entityId: `${USER_1}:VIEWINGS`,
        action: "UPDATE",
        field: "status",
        oldValue: "PENDING",
        newValue: "DONE",
      }),
    });
  });

  it("treats a stage with no row as previously PENDING when auditing", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await setRentalStageStatus(ACTOR, USER_1, "VIEWINGS", "DONE");

    expect(mockedAudit.mock.calls[0][0].data.oldValue).toBe("PENDING");
  });

  it.each([
    ["an unknown stage", "NOT_A_STAGE", "DONE", /Unrecognized rental stage key/],
    ["an unknown status", "VIEWINGS", "MAYBE", /Unrecognized rental stage status/],
  ])("rejects %s without writing", async (_label, stageKey, status, expected) => {
    await expect(setRentalStageStatus(ACTOR, USER_1, stageKey, status as never)).rejects.toThrow(expected);
    expect(mockedUpsert).not.toHaveBeenCalled();
  });
});

describe("setOfferDetails", () => {
  it("stores price, duration and comments together", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await setOfferDetails(ACTOR, USER_1, { price: 1500, durationMonths: 12, comments: "Parking included" });

    expect(mockedUpsert.mock.calls[0][0].update).toMatchObject({
      offerPrice: 1500,
      offerDurationMonths: 12,
      offerComments: "Parking included",
    });
  });

  it("audits each offer field that changed", async () => {
    mockedFindFirst.mockResolvedValueOnce({
      offerPrice: "1000",
      offerDurationMonths: 12,
      offerComments: null,
    } as never);

    await setOfferDetails(ACTOR, USER_1, { price: 1500, durationMonths: 12, comments: null });

    // Price changed; duration and comments did not.
    expect(mockedAudit).toHaveBeenCalledTimes(1);
    expect(mockedAudit.mock.calls[0][0].data.field).toBe("offerPrice");
  });

  it.each([
    ["a non-positive price", { price: 0 }, /price must be a positive/],
    ["a fractional duration", { durationMonths: 1.5 }, /whole number of months/],
    ["a non-positive duration", { durationMonths: 0 }, /whole number of months/],
  ])("rejects %s without writing", async (_label, input, expected) => {
    await expect(setOfferDetails(ACTOR, USER_1, input)).rejects.toThrow(expected);
    expect(mockedUpsert).not.toHaveBeenCalled();
  });

  it("accepts explicit nulls, so an offer can be cleared", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await setOfferDetails(ACTOR, USER_1, { price: null, durationMonths: null, comments: null });

    expect(mockedUpsert).toHaveBeenCalled();
  });
});

describe("attachRentalStageFile", () => {
  it("records the stored path and original filename", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    await attachRentalStageFile(ACTOR, USER_1, "ENERGY_CERTIFICATE", {
      path: "t/u/ENERGY_CERTIFICATE-1.pdf",
      filename: "epc.pdf",
    });

    expect(mockedUpsert.mock.calls[0][0].update).toMatchObject({
      attachmentPath: "t/u/ENERGY_CERTIFICATE-1.pdf",
      attachmentFilename: "epc.pdf",
    });
  });

  it("audits the attachment by filename", async () => {
    mockedFindFirst.mockResolvedValueOnce({ attachmentFilename: "old.pdf" } as never);

    await attachRentalStageFile(ACTOR, USER_1, "CONTRACT_SIGNED", { path: "p", filename: "new.pdf" });

    expect(mockedAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({ field: "attachment", oldValue: "old.pdf", newValue: "new.pdf" }),
    });
  });

  it("refuses to attach a file to a stage that has no slot", async () => {
    // Attaching to e.g. Keys Delivered is a programming error, not a user
    // one — storing an orphan path nothing renders would hide the bug.
    await expect(
      attachRentalStageFile(ACTOR, USER_1, "KEYS_DELIVERED", { path: "p", filename: "f.pdf" }),
    ).rejects.toThrow(/does not accept a file attachment/);
    expect(mockedUpsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown stage key", async () => {
    await expect(
      attachRentalStageFile(ACTOR, USER_1, "NOPE", { path: "p", filename: "f.pdf" }),
    ).rejects.toThrow(/Unrecognized rental stage key/);
  });
});

describe("getRentalStageAttachmentPath", () => {
  it("returns the stored path when one exists", async () => {
    mockedFindFirst.mockResolvedValueOnce({ attachmentPath: "t/u/f.pdf" } as never);

    expect(await getRentalStageAttachmentPath(TENANT_A, USER_1, "ENERGY_CERTIFICATE")).toBe("t/u/f.pdf");
  });

  it("returns null when the stage has no row or no attachment", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);

    expect(await getRentalStageAttachmentPath(TENANT_A, USER_1, "ENERGY_CERTIFICATE")).toBeNull();
  });
});
