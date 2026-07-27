import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ClientDirectory } from "@/components/ui/ClientDirectory";
import type { ClientDirectoryEntry } from "@/lib/data/clients";

function client(overrides: Partial<ClientDirectoryEntry> = {}): ClientDirectoryEntry {
  return {
    id: "user_1",
    name: "Maria Papadopoulos",
    email: "maria@example.com",
    phone: "+30 210 0000000",
    nationality: "Greek",
    property: "Villa Elytra — Chania",
    joinedDate: "14 Mar 2026",
    visa: { completed: 2, total: 5 },
    rental: { completed: 3, total: 10 },
    outstanding: 50000,
    ...overrides,
  };
}

describe("ClientDirectory", () => {
  it("renders a row per client with identity, property and balance", () => {
    render(<ClientDirectory clients={[client()]} />);

    expect(screen.getByText("Maria Papadopoulos")).toBeVisible();
    expect(screen.getByText("maria@example.com")).toBeVisible();
    expect(screen.getByText("Villa Elytra — Chania")).toBeVisible();
    expect(screen.getByText("€50,000.00")).toBeVisible();
  });

  it("links each row to that client's profile", () => {
    render(<ClientDirectory clients={[client()]} />);

    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "/dashboard/clients/user_1");
  });

  it("shows cross-workflow progress so an admin can triage without opening each profile", () => {
    render(<ClientDirectory clients={[client()]} />);

    expect(screen.getByText("2 of 5")).toBeVisible();
    expect(screen.getByText("3 of 10")).toBeVisible();
  });

  it("says 'Not started' rather than '0 of 0' for a client with no visa steps", () => {
    // "0 of 0" reads as a stalled process; this one has simply not begun.
    render(<ClientDirectory clients={[client({ visa: { completed: 0, total: 0 } })]} />);

    const row = screen.getByRole("row", { name: /Maria/ });
    expect(within(row).getAllByText("Not started").length).toBeGreaterThan(0);
  });

  it("says 'Not started' for a client with no completed letting stage", () => {
    render(<ClientDirectory clients={[client({ rental: { completed: 0, total: 10 } })]} />);

    expect(screen.getAllByText("Not started").length).toBeGreaterThan(0);
  });

  it("renders a muted placeholder for a client with no property assigned", () => {
    render(<ClientDirectory clients={[client({ property: null })]} />);

    expect(screen.queryByText("Villa Elytra — Chania")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders a placeholder for a missing phone without dropping the nationality", () => {
    render(<ClientDirectory clients={[client({ phone: null })]} />);

    expect(screen.getByText(/Greek/)).toBeVisible();
  });

  it("omits the nationality separator entirely when nationality is missing", () => {
    render(<ClientDirectory clients={[client({ nationality: null })]} />);

    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("mutes a zero balance rather than emphasising it like a debt", () => {
    render(<ClientDirectory clients={[client({ outstanding: 0 })]} />);

    expect(screen.getByText("€0.00")).toHaveClass("text-stone-400");
  });

  it("tells an admin how to add their first client instead of rendering an empty table", () => {
    render(<ClientDirectory clients={[]} />);

    expect(screen.getByText(/No clients yet/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
