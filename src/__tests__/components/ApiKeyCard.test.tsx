import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiKeyCard, MOCK_API_KEY } from "@/components/ui/ApiKeyCard";

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("ApiKeyCard", () => {
  it("renders the key label, masked value, provider, and dates from mock data", () => {
    render(<ApiKeyCard />);

    expect(screen.getByText(MOCK_API_KEY.label)).toBeInTheDocument();
    expect(screen.getByText(MOCK_API_KEY.maskedKey)).toBeInTheDocument();
    // Exact match: the label ("Production — Anthropic") also contains the
    // word "Anthropic", so a loose /Anthropic/ regex would match both nodes.
    expect(screen.getByText("Anthropic · Bring Your Own Key")).toBeInTheDocument();
    expect(screen.getByText(`Added ${MOCK_API_KEY.createdAt}`)).toBeInTheDocument();
    expect(screen.getByText(`Last used ${MOCK_API_KEY.lastUsedAt}`)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("never renders a raw, unmasked secret", () => {
    render(<ApiKeyCard />);
    expect(screen.queryByText(/^sk-[^•]+$/)).not.toBeInTheDocument();
  });

  it("shows visible, enabled Rotate key and Revoke buttons for an active key", () => {
    render(<ApiKeyCard />);

    const rotate = screen.getByRole("button", { name: /Rotate key/ });
    const revoke = screen.getByRole("button", { name: "Revoke" });
    expect(rotate).toBeVisible();
    expect(rotate).toBeEnabled();
    expect(revoke).toBeVisible();
    expect(revoke).toBeEnabled();
  });

  it("calls onRotate and onRevoke with the key id when clicked", async () => {
    const user = userEvent.setup();
    const onRotate = vi.fn();
    const onRevoke = vi.fn();
    render(<ApiKeyCard onRotate={onRotate} onRevoke={onRevoke} />);

    await user.click(screen.getByRole("button", { name: /Rotate key/ }));
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    expect(onRotate).toHaveBeenCalledWith(MOCK_API_KEY.id);
    expect(onRevoke).toHaveBeenCalledWith(MOCK_API_KEY.id);
  });

  it("copies the masked reference to the clipboard when the copy button is clicked", () => {
    // Uses fireEvent rather than user-event here: user-event's setup()
    // installs its own clipboard polyfill (for its .copy()/.paste() helpers),
    // which overwrites the navigator.clipboard mock defined in beforeEach.
    render(<ApiKeyCard />);

    fireEvent.click(screen.getByRole("button", { name: "Copy masked key reference" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(MOCK_API_KEY.maskedKey);
  });

  it("disables Rotate key and Revoke, and shows a Revoked badge, once a key is revoked", () => {
    render(<ApiKeyCard apiKey={{ ...MOCK_API_KEY, status: "revoked" }} />);

    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rotate key/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDisabled();
  });
});
