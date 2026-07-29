import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PipelineBoard } from "@/components/ui/PipelineBoard";
import type { ContactView, DealView } from "@/lib/pipeline";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
}));

vi.mock("@/app/dashboard/pipeline/actions", () => ({
  createDealAction: vi.fn(),
  moveDealAction: vi.fn(),
  deleteDealAction: vi.fn(),
}));

import {
  createDealAction,
  deleteDealAction,
  moveDealAction,
} from "@/app/dashboard/pipeline/actions";

const mockedCreate = vi.mocked(createDealAction);
const mockedMove = vi.mocked(moveDealAction);
const mockedDelete = vi.mocked(deleteDealAction);

function makeDeal(overrides: Partial<DealView> = {}): DealView {
  return {
    id: "d1",
    title: "2-bed in Athens",
    stage: "LEAD",
    stageLabel: "Lead",
    value: 250000,
    expectedCloseDate: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    position: 1000,
    contactId: "c1",
    contactName: "Maria Papadopoulos",
    contactEmail: "maria@example.com",
    contactClerkUserId: null,
    propertyId: null,
    propertyName: null,
    ownerUserId: "user_admin",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    documentCategories: [],
    ...overrides,
  };
}

const CONTACTS: ContactView[] = [
  {
    id: "c1",
    firstName: "Maria",
    lastName: "Papadopoulos",
    fullName: "Maria Papadopoulos",
    email: "maria@example.com",
    phone: null,
    nationality: null,
    source: null,
    notes: null,
    clerkUserId: null,
    ownerUserId: "user_admin",
    createdAt: "2026-07-01T00:00:00.000Z",
    openDealCount: 1,
  },
];

const PROPERTIES = [{ id: "p1", name: "Aegean Court" }];

function renderBoard(deals: DealView[], contacts = CONTACTS) {
  return render(<PipelineBoard deals={deals} contacts={contacts} properties={PROPERTIES} />);
}

/** The drag payload a real browser would carry. */
function dragCardTo(cardTitle: string, columnHeading: RegExp, dealId: string) {
  const card = screen.getByText(cardTitle).closest("article")!;
  fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });

  const column = screen.getByRole("heading", { name: columnHeading }).closest("div")!.parentElement!;
  fireEvent.drop(column, { dataTransfer: { getData: () => dealId } });
}

beforeEach(() => {
  mockRefresh.mockReset();
  mockedCreate.mockReset().mockResolvedValue(undefined);
  mockedMove.mockReset().mockResolvedValue(undefined);
  mockedDelete.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

describe("board layout", () => {
  it("renders all four open stages, including empty ones", () => {
    // An empty "Athens visit" column is information, and it is also where a card
    // has to be droppable.
    renderBoard([]);

    for (const label of ["Lead", "Zoom meeting", "Athens visit", "Power of attorney"]) {
      expect(screen.getByRole("heading", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("keeps Buyer and Lost off the board", () => {
    renderBoard([]);

    expect(screen.queryByRole("heading", { name: /^Buyer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Lost/ })).not.toBeInTheDocument();
  });

  it("puts each deal under its own stage", () => {
    renderBoard([makeDeal({ id: "a", stage: "ATHENS_VISIT", title: "Offer deal" })]);

    const visitColumn = screen
      .getByRole("heading", { name: /Athens visit/ })
      .closest("div")!.parentElement!;
    expect(within(visitColumn).getByText("Offer deal")).toBeInTheDocument();
  });

  it("says a deal has no value rather than showing €0", () => {
    // "€0" reads as "worth nothing"; "No value set" reads as "nobody priced
    // this yet", which is what is actually true.
    renderBoard([makeDeal({ value: null })]);

    expect(screen.getByText("No value set")).toBeInTheDocument();
  });
});

describe("stage paperwork", () => {
  it("flags a deal whose stage claims a document that is not on file", () => {
    renderBoard([
      makeDeal({ stage: "POWER_OF_ATTORNEY", stageLabel: "Power of attorney", documentCategories: [] }),
    ]);

    expect(screen.getByText("Power of attorney not on file")).toBeInTheDocument();
  });

  it("clears the flag once the document is uploaded", () => {
    renderBoard([
      makeDeal({
        stage: "POWER_OF_ATTORNEY",
        stageLabel: "Power of attorney",
        documentCategories: ["POWER_OF_ATTORNEY"],
      }),
    ]);

    expect(screen.queryByText(/not on file/)).not.toBeInTheDocument();
  });

  it("does not flag an early stage, which needs no paperwork", () => {
    renderBoard([makeDeal({ stage: "LEAD", documentCategories: [] })]);

    expect(screen.queryByText(/not on file/)).not.toBeInTheDocument();
  });

  it("still lets the card be dragged — the flag is a warning, not a block", async () => {
    // Blocking would make backfilling historical deals impossible, and would
    // get worked around by mis-staging the card, which is worse.
    renderBoard([makeDeal({ id: "d1", stage: "LEAD", documentCategories: [] })]);

    dragCardTo("2-bed in Athens", /Power of attorney/, "d1");

    await waitFor(() => expect(mockedMove).toHaveBeenCalledTimes(1));
    expect(mockedMove.mock.calls[0][1]).toBe("POWER_OF_ATTORNEY");
  });
});

describe("forecast tiles", () => {
  it("weights open value by stage probability", () => {
    renderBoard([
      makeDeal({ id: "a", stage: "LEAD", value: 100000 }),
      makeDeal({ id: "b", stage: "POWER_OF_ATTORNEY", value: 200000 }),
    ]);

    expect(screen.getByText("Weighted forecast")).toBeInTheDocument();
    expect(screen.getByText("2 open deals")).toBeInTheDocument();
  });

  it("says out loud that the weighting is an assumption, not measured history", () => {
    // "€412,000 weighted" reads as a fact. It is not one.
    renderBoard([makeDeal()]);

    expect(
      screen.getByText(/Based on default stage probabilities, not closed-deal history/),
    ).toBeInTheDocument();
  });

  it("flags open deals carrying no value instead of hiding the gap", () => {
    renderBoard([makeDeal({ id: "a", value: null }), makeDeal({ id: "b", value: 50000 })]);

    expect(screen.getByText("1 with no value recorded")).toBeInTheDocument();
  });
});

describe("dragging a deal", () => {
  it("moves the card and tells the server", async () => {
    renderBoard([makeDeal({ id: "d1", stage: "LEAD" })]);

    dragCardTo("2-bed in Athens", /Athens visit/, "d1");

    await waitFor(() => expect(mockedMove).toHaveBeenCalledTimes(1));
    const [dealId, stage, position] = mockedMove.mock.calls[0];
    expect(dealId).toBe("d1");
    expect(stage).toBe("ATHENS_VISIT");
    expect(Number.isFinite(position)).toBe(true);
  });

  it("moves the card optimistically, before the server responds", async () => {
    // A drag that waits for a round trip before the card moves feels broken.
    let resolveMove: () => void = () => {};
    mockedMove.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveMove = resolve; }),
    );
    renderBoard([makeDeal({ id: "d1", stage: "LEAD" })]);

    dragCardTo("2-bed in Athens", /Athens visit/, "d1");

    const visitColumn = screen.getByRole("heading", { name: /Athens visit/ }).closest("div")!.parentElement!;
    await waitFor(() => expect(within(visitColumn).getByText("2-bed in Athens")).toBeInTheDocument());

    resolveMove();
  });

  it("puts the card back and explains when the server rejects the move", async () => {
    mockedMove.mockRejectedValueOnce(new Error("Unrecognized deal stage."));
    renderBoard([makeDeal({ id: "d1", stage: "LEAD" })]);

    dragCardTo("2-bed in Athens", /Athens visit/, "d1");

    expect(await screen.findByRole("alert")).toHaveTextContent(/Unrecognized deal stage/);
    const leadColumn = screen.getByRole("heading", { name: /Lead/ }).closest("div")!.parentElement!;
    await waitFor(() => expect(within(leadColumn).getByText("2-bed in Athens")).toBeInTheDocument());
  });

  it("does nothing when a card is dropped back into its own column", async () => {
    renderBoard([makeDeal({ id: "d1", stage: "LEAD" })]);

    dragCardTo("2-bed in Athens", /Lead/, "d1");

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockedMove).not.toHaveBeenCalled();
  });
});

describe("adding a deal", () => {
  it("cannot be started with no contacts, because a deal belongs to someone", () => {
    renderBoard([], []);

    expect(screen.getByText(/Add a contact first/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Add deal/ })[0]).toBeDisabled();
  });

  it("creates a deal in the column it was started from", async () => {
    const user = userEvent.setup();
    renderBoard([]);

    const visitColumn = screen.getByRole("heading", { name: /Athens visit/ }).closest("div")!.parentElement!;
    await user.click(within(visitColumn).getByRole("button", { name: /Add deal/ }));
    await user.type(within(visitColumn).getByLabelText("Deal title"), "New opportunity");
    await user.selectOptions(within(visitColumn).getByLabelText("Contact"), "c1");
    await user.click(within(visitColumn).getByRole("button", { name: "Add deal" }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({ title: "New opportunity", contactId: "c1", stage: "ATHENS_VISIT" }),
      ),
    );
  });

  it("surfaces a rejected creation inline", async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValueOnce(new Error("A deal needs a title."));
    renderBoard([]);

    const column = screen.getByRole("heading", { name: /Lead/ }).closest("div")!.parentElement!;
    await user.click(within(column).getByRole("button", { name: /Add deal/ }));
    await user.type(within(column).getByLabelText("Deal title"), "x");
    await user.selectOptions(within(column).getByLabelText("Contact"), "c1");
    await user.click(within(column).getByRole("button", { name: "Add deal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/needs a title/);
  });
});

describe("closed deals", () => {
  it("lists them below the board rather than as an ever-growing column", () => {
    // A Won column would grow forever and push the live stages off-screen.
    renderBoard([
      makeDeal({ id: "w", stage: "BUYER", title: "Closed win", value: 300000 }),
      makeDeal({ id: "l", stage: "LOST", title: "Closed loss", lostReason: "Chose another agent" }),
    ]);

    expect(screen.getByRole("heading", { name: /Closed/ })).toBeInTheDocument();
    expect(screen.getByText("Closed win")).toBeInTheDocument();
    expect(screen.getByText("Chose another agent")).toBeInTheDocument();
  });

  it("renders no closed section when nothing has closed", () => {
    renderBoard([makeDeal()]);

    expect(screen.queryByRole("heading", { name: /Closed/ })).not.toBeInTheDocument();
  });
});

describe("converted contacts", () => {
  it("links a deal to the client record once the contact has an account", () => {
    renderBoard([makeDeal({ contactClerkUserId: "user_maria" })]);

    expect(screen.getByRole("link", { name: /Maria Papadopoulos/ })).toHaveAttribute(
      "href",
      "/dashboard/clients/user_maria",
    );
  });

  it("shows a plain name for a prospect, who has no record page yet", () => {
    renderBoard([makeDeal({ contactClerkUserId: null })]);

    expect(screen.queryByRole("link", { name: /Maria Papadopoulos/ })).not.toBeInTheDocument();
    expect(screen.getByText("Maria Papadopoulos")).toBeInTheDocument();
  });
});

describe("deleting a deal", () => {
  it("confirms first, then deletes", async () => {
    const user = userEvent.setup();
    renderBoard([makeDeal()]);

    await user.click(screen.getByLabelText("Delete deal: 2-bed in Athens"));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith("d1"));
  });

  it("does nothing when the confirmation is declined", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => false));
    renderBoard([makeDeal()]);

    await user.click(screen.getByLabelText("Delete deal: 2-bed in Athens"));

    expect(mockedDelete).not.toHaveBeenCalled();
  });
});
