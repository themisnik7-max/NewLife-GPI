import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportSalesPanel } from "./ImportSalesPanel";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

vi.mock("./importActions", () => ({ importSalesAction: vi.fn() }));

import { importSalesAction } from "./importActions";

const mockedImport = vi.mocked(importSalesAction);

/** jsdom's File has no usable .text() in this environment, so it is stubbed. */
function csvFile(contents: string, name = "sales.csv"): File {
  const file = new File([contents], name, { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => contents });
  return file;
}

const GOOD_CSV = [
  "Property,Buyer Email,Sale Price,Sale Date",
  "Aegean Court,maria@example.com,250000,01/06/2026",
  "Villa Elytra,li@example.com,180000,15/05/2026",
].join("\n");

beforeEach(() => {
  mockRefresh.mockReset();
  mockedImport.mockReset().mockResolvedValue({
    created: 2,
    updated: 0,
    skipped: 0,
    failed: 0,
    rows: [],
  });
});

async function upload(user: ReturnType<typeof userEvent.setup>, contents: string) {
  await user.upload(screen.getByLabelText("Choose a CSV file to import"), csvFile(contents));
}

describe("the upload step", () => {
  it("tells the user how to produce a CSV from Excel", () => {
    // The dependency that would read .xlsx directly is not approved, so the
    // panel says what to do instead rather than silently accepting nothing.
    render(<ImportSalesPanel />);

    expect(screen.getByText(/File → Save As → CSV UTF-8/)).toBeInTheDocument();
  });

  it("rejects a file with no rows and says why", async () => {
    const user = userEvent.setup();
    render(<ImportSalesPanel />);

    await upload(user, "Property,Email\n");

    expect(await screen.findByRole("alert")).toHaveTextContent(/no rows/);
  });
});

describe("column mapping", () => {
  it("guesses the mapping and shows it for confirmation", async () => {
    // A wrong guess that silently imports 40 rows into the wrong column costs
    // far more than one the user corrects in a dropdown.
    const user = userEvent.setup();
    render(<ImportSalesPanel />);

    await upload(user, GOOD_CSV);

    await waitFor(() => expect(screen.getByLabelText("Property")).toHaveValue("0"));
    expect(screen.getByLabelText("Buyer email")).toHaveValue("1");
    expect(screen.getByLabelText("Sale price")).toHaveValue("2");
    expect(screen.getByLabelText("Sale date")).toHaveValue("3");
  });

  it("blocks the import until every required column is matched", async () => {
    const user = userEvent.setup();
    render(<ImportSalesPanel />);
    await upload(user, GOOD_CSV);

    await waitFor(() => expect(screen.getByLabelText("Property")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Property"), "");

    expect(await screen.findByText(/Match a column for: Property/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Import/ })).toBeDisabled();
  });

  it("does not require the optional columns", async () => {
    const user = userEvent.setup();
    render(<ImportSalesPanel />);
    await upload(user, GOOD_CSV);

    await waitFor(() => expect(screen.getByLabelText("Sale price")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Sale price"), "");
    await user.selectOptions(screen.getByLabelText("Sale date"), "");

    expect(screen.queryByText(/Match a column for/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Import 2 rows/ })).toBeEnabled();
  });
});

describe("the preview", () => {
  it("says how many rows will be imported before anything is written", async () => {
    const user = userEvent.setup();
    render(<ImportSalesPanel />);

    await upload(user, GOOD_CSV);

    expect(await screen.findByText(/2 rows will be imported/)).toBeInTheDocument();
    expect(mockedImport).not.toHaveBeenCalled();
  });

  it("names each bad row by the line the user can go and look at", async () => {
    const user = userEvent.setup();
    render(<ImportSalesPanel />);

    await upload(
      user,
      [
        "Property,Buyer Email,Sale Price,Sale Date",
        "Aegean Court,maria@example.com,250000,01/06/2026",
        ",not-an-email,rubbish,not a date",
      ].join("\n"),
    );

    expect(await screen.findByText(/1 row will be imported, 1 skipped/)).toBeInTheDocument();
    expect(screen.getByText(/Row 2:/)).toBeInTheDocument();
  });

  it("reads slash dates day-first, matching Greek convention", async () => {
    const user = userEvent.setup();
    render(<ImportSalesPanel />);

    // 06/07/2026 is 6 July, not 7 June — and being in the past, it is valid.
    await upload(
      user,
      "Property,Buyer Email,Sale Date\nAegean Court,maria@example.com,06/07/2026",
    );

    expect(await screen.findByText(/1 row will be imported/)).toBeInTheDocument();
  });

  it("refuses a whole file of bad rows rather than importing nothing silently", async () => {
    const user = userEvent.setup();
    render(<ImportSalesPanel />);

    // Rows carrying content but failing validation. A line of only delimiters
    // would not reach here at all — readCsv drops it as blank, which is why
    // the earlier "no rows" guard exists.
    await upload(
      user,
      ["Property,Buyer Email", "Aegean Court,not-an-email", ",someone@example.com"].join("\n"),
    );

    expect(await screen.findByText(/0 rows will be imported, 2 skipped/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Import 0 rows/ })).toBeDisabled();
  });
});

describe("applying", () => {
  it("sends the parsed rows and the mapping, not a pre-built plan", async () => {
    // The server rebuilds the plan itself — a client could otherwise post one
    // claiming a future date or a negative price.
    const user = userEvent.setup();
    render(<ImportSalesPanel />);
    await upload(user, GOOD_CSV);

    await user.click(await screen.findByRole("button", { name: /^Import 2 rows/ }));

    await waitFor(() => expect(mockedImport).toHaveBeenCalledTimes(1));
    const [payload] = mockedImport.mock.calls[0];
    expect(payload.parsed.rows).toHaveLength(2);
    expect(payload.mapping.propertyName).toBe(0);
  });

  it("reports the outcome, listing every failure", async () => {
    const user = userEvent.setup();
    mockedImport.mockResolvedValueOnce({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 1,
      rows: [
        { lineNumber: 2, outcome: "failed", detail: "No property named \"Villa Elytra\"." },
      ],
    });
    render(<ImportSalesPanel />);
    await upload(user, GOOD_CSV);

    await user.click(await screen.findByRole("button", { name: /^Import/ }));

    // Matched on the paragraph's whole textContent: the counts sit in <span>s,
    // so a plain /1 created/ regex is split across elements and never matches.
    // Scoped to the <p> itself — every ancestor also contains this text, so an
    // unscoped textContent matcher finds the div, the section and the body too.
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === "P" &&
          (element.textContent ?? "").includes("1 created, 0 updated, 0 skipped, 1 failed."),
      ),
    ).toBeInTheDocument();
    // "40 done" while silently dropping 12 is the failure this prevents.
    expect(screen.getByText(/No property named/)).toBeInTheDocument();
  });

  it("surfaces a rejected import inline", async () => {
    const user = userEvent.setup();
    mockedImport.mockRejectedValueOnce(new Error("Admin access required."));
    render(<ImportSalesPanel />);
    await upload(user, GOOD_CSV);

    await user.click(await screen.findByRole("button", { name: /^Import/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Admin access required/);
  });

  it("offers a fresh start after a run", async () => {
    const user = userEvent.setup();
    render(<ImportSalesPanel />);
    await upload(user, GOOD_CSV);
    await user.click(await screen.findByRole("button", { name: /^Import/ }));

    await user.click(await screen.findByRole("button", { name: /Import another file/ }));

    expect(screen.getByLabelText("Choose a CSV file to import")).toBeInTheDocument();
  });
});
