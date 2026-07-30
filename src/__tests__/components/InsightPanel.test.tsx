import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InsightPanel } from "@/components/ui/InsightPanel";

vi.mock("@/app/dashboard/insights/actions", () => ({
  generatePipelineMonitorAction: vi.fn(),
  generateClientBriefAction: vi.fn(),
}));

import {
  generateClientBriefAction,
  generatePipelineMonitorAction,
} from "@/app/dashboard/insights/actions";

const mockedMonitor = vi.mocked(generatePipelineMonitorAction);
const mockedBrief = vi.mocked(generateClientBriefAction);

const RESULT = {
  signals: [
    { kind: "payments_overdue", severity: "critical" as const, message: "2 installments are past due.", href: "/dashboard/payments" },
    { kind: "deals_missing_value", severity: "info" as const, message: "1 open deal has no value recorded." },
  ],
  narrative: "Chase the two overdue installments first.",
  narrativeUnavailableReason: null,
  costUsd: 0.0042,
};

beforeEach(() => {
  mockedMonitor.mockReset().mockResolvedValue(RESULT);
  mockedBrief.mockReset().mockResolvedValue(RESULT);
});

describe("on-demand generation", () => {
  it("does not call the AI on mount — that would bill the tenant for a page view", async () => {
    render(<InsightPanel mode="pipeline" />);

    // A panel that spends money because someone opened a page is a panel
    // that gets switched off.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockedMonitor).not.toHaveBeenCalled();
  });

  it("explains what it will do before it is run", () => {
    render(<InsightPanel mode="pipeline" />);

    expect(screen.getByText(/Check the pipeline for stalled deals/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyse" })).toBeInTheDocument();
  });

  it("runs the tenant-wide monitor in pipeline mode", async () => {
    const user = userEvent.setup();
    render(<InsightPanel mode="pipeline" />);

    await user.click(screen.getByRole("button", { name: "Analyse" }));

    await waitFor(() => expect(mockedMonitor).toHaveBeenCalledTimes(1));
    expect(mockedBrief).not.toHaveBeenCalled();
  });

  it("briefs the named subject in client mode", async () => {
    const user = userEvent.setup();
    render(<InsightPanel mode="client" userId="user_maria" />);

    await user.click(screen.getByRole("button", { name: "Analyse" }));

    await waitFor(() => expect(mockedBrief).toHaveBeenCalledWith("user_maria"));
  });

  it("offers a refresh once a result exists", async () => {
    const user = userEvent.setup();
    render(<InsightPanel mode="pipeline" />);

    await user.click(screen.getByRole("button", { name: "Analyse" }));

    expect(await screen.findByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});

describe("rendering the result", () => {
  it("separates computed facts from generated prose", async () => {
    const user = userEvent.setup();
    render(<InsightPanel mode="pipeline" />);
    await user.click(screen.getByRole("button", { name: "Analyse" }));

    // Presenting them identically would invite equal trust in both, and only
    // one of them is arithmetic.
    expect(await screen.findByText("Detected from your data")).toBeInTheDocument();
    expect(screen.getByText("AI summary")).toBeInTheDocument();
    expect(screen.getByText("2 installments are past due.")).toBeInTheDocument();
    expect(screen.getByText("Chase the two overdue installments first.")).toBeInTheDocument();
  });

  it("links a signal to the page that fixes it", async () => {
    const user = userEvent.setup();
    render(<InsightPanel mode="pipeline" />);
    await user.click(screen.getByRole("button", { name: "Analyse" }));

    const link = await screen.findByRole("link", { name: "View" });
    expect(link).toHaveAttribute("href", "/dashboard/payments");
  });

  it("renders no link for a signal without a destination", async () => {
    const user = userEvent.setup();
    render(<InsightPanel mode="pipeline" />);
    await user.click(screen.getByRole("button", { name: "Analyse" }));

    await screen.findByText("1 open deal has no value recorded.");
    // Only the first signal carries an href.
    expect(screen.getAllByRole("link", { name: "View" })).toHaveLength(1);
  });

  it("shows what the call cost, on the tenant's own key", async () => {
    const user = userEvent.setup();
    render(<InsightPanel mode="pipeline" />);
    await user.click(screen.getByRole("button", { name: "Analyse" }));

    expect(await screen.findByText("$0.0042")).toBeInTheDocument();
  });

  it("says so plainly when nothing needs attention", async () => {
    const user = userEvent.setup();
    mockedMonitor.mockResolvedValueOnce({
      signals: [],
      narrative: "The pipeline looks healthy.",
      narrativeUnavailableReason: null,
      costUsd: 0.001,
    });
    render(<InsightPanel mode="pipeline" />);

    await user.click(screen.getByRole("button", { name: "Analyse" }));

    expect(await screen.findByText("Nothing needs attention right now.")).toBeInTheDocument();
  });
});

describe("degrading without AI", () => {
  it("still shows the computed signals when no summary could be generated", async () => {
    // The signals are the substance; the prose is the polish. A missing key
    // must not take down the half that works.
    const user = userEvent.setup();
    mockedMonitor.mockResolvedValueOnce({
      ...RESULT,
      narrative: null,
      narrativeUnavailableReason: "No AI key is configured for this workspace.",
      costUsd: null,
    });
    render(<InsightPanel mode="pipeline" />);

    await user.click(screen.getByRole("button", { name: "Analyse" }));

    expect(await screen.findByText("2 installments are past due.")).toBeInTheDocument();
    expect(screen.getByText(/No AI key is configured/)).toBeInTheDocument();
  });

  it("shows no cost when nothing was charged", async () => {
    const user = userEvent.setup();
    mockedMonitor.mockResolvedValueOnce({ ...RESULT, costUsd: null });
    render(<InsightPanel mode="pipeline" />);

    await user.click(screen.getByRole("button", { name: "Analyse" }));

    await screen.findByText("Detected from your data");
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });

  it("surfaces a rejected run inline rather than throwing", async () => {
    const user = userEvent.setup();
    mockedMonitor.mockRejectedValueOnce(new Error("Admin access required."));
    render(<InsightPanel mode="pipeline" />);

    await user.click(screen.getByRole("button", { name: "Analyse" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Admin access required/);
  });
});
