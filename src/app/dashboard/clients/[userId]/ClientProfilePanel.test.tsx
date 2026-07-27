import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientProfilePanel } from "./ClientProfilePanel";
import type { ClientProfile } from "@/lib/data/clients";

vi.mock("./actions", () => ({
  updateClientProfileAction: vi.fn(),
}));

import { updateClientProfileAction } from "./actions";

const mockedUpdate = vi.mocked(updateClientProfileAction);

function profile(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    id: "user_1",
    name: "Maria Papadopoulos",
    email: "maria@example.com",
    joinedDate: "14 Mar 2026",
    phone: "+30 210 0000000",
    nationality: "Greek",
    passportNumber: "AB1234567",
    dateOfBirth: "1985-06-02",
    adminNotes: "Prefers email contact.",
    ...overrides,
  };
}

beforeEach(() => {
  mockedUpdate.mockReset().mockResolvedValue(undefined);
});

describe("ClientProfilePanel", () => {
  it("shows the Clerk-owned identity fields as read-only text, not inputs", () => {
    // Clerk owns name and email and syncs them by webhook; an input here
    // would create a second source of truth that drifts.
    render(<ClientProfilePanel profile={profile()} />);

    expect(screen.getByText("Maria Papadopoulos")).toBeVisible();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByText(/not editable here/)).toBeVisible();
  });

  it("prefills every editable field from the stored profile", () => {
    render(<ClientProfilePanel profile={profile()} />);

    expect(screen.getByLabelText("Phone")).toHaveValue("+30 210 0000000");
    expect(screen.getByLabelText("Nationality")).toHaveValue("Greek");
    expect(screen.getByLabelText("Passport / ID number")).toHaveValue("AB1234567");
    expect(screen.getByLabelText("Date of birth")).toHaveValue("1985-06-02");
  });

  it("renders empty inputs rather than the string 'null' for an unfilled profile", () => {
    render(
      <ClientProfilePanel
        profile={profile({ phone: null, nationality: null, passportNumber: null, dateOfBirth: null, adminNotes: null })}
      />,
    );

    expect(screen.getByLabelText("Phone")).toHaveValue("");
    expect(screen.getByLabelText("Date of birth")).toHaveValue("");
  });

  it("labels the notes field as internal, so an admin knows what the client can see", () => {
    render(<ClientProfilePanel profile={profile()} />);

    expect(screen.getByLabelText("Internal notes — not visible to the client")).toHaveValue(
      "Prefers email contact.",
    );
  });

  it("submits every field, so clearing one actually clears it", async () => {
    // A form that only sends non-empty fields can add data but never remove
    // it, which makes a mistyped passport number permanent.
    const user = userEvent.setup();
    render(<ClientProfilePanel profile={profile()} />);

    await user.clear(screen.getByLabelText("Phone"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("user_1", {
        phone: "",
        nationality: "Greek",
        passportNumber: "AB1234567",
        dateOfBirth: "1985-06-02",
        adminNotes: "Prefers email contact.",
      }),
    );
  });

  it("sends null rather than an empty string for a cleared date of birth", async () => {
    // An empty string is not a valid date; null is what "not recorded" means
    // in the column.
    const user = userEvent.setup();
    render(<ClientProfilePanel profile={profile()} />);

    await user.clear(screen.getByLabelText("Date of birth"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("user_1", expect.objectContaining({ dateOfBirth: null })),
    );
  });

  it("passes every edited field through, not just the first one touched", async () => {
    const user = userEvent.setup();
    render(<ClientProfilePanel profile={profile()} />);

    await user.clear(screen.getByLabelText("Nationality"));
    await user.type(screen.getByLabelText("Nationality"), "Cypriot");
    await user.clear(screen.getByLabelText("Passport / ID number"));
    await user.type(screen.getByLabelText("Passport / ID number"), "CY9876543");
    await user.clear(screen.getByLabelText("Phone"));
    await user.type(screen.getByLabelText("Phone"), "+357 22 000000");
    await user.clear(screen.getByLabelText("Internal notes — not visible to the client"));
    await user.type(screen.getByLabelText("Internal notes — not visible to the client"), "Moved to Cyprus.");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("user_1", {
        phone: "+357 22 000000",
        nationality: "Cypriot",
        passportNumber: "CY9876543",
        dateOfBirth: "1985-06-02",
        adminNotes: "Moved to Cyprus.",
      }),
    );
  });

  it("passes an edited date of birth through", async () => {
    const user = userEvent.setup();
    render(<ClientProfilePanel profile={profile()} />);

    await user.clear(screen.getByLabelText("Date of birth"));
    await user.type(screen.getByLabelText("Date of birth"), "1990-01-15");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith("user_1", expect.objectContaining({ dateOfBirth: "1990-01-15" })),
    );
  });

  it("confirms a successful save", async () => {
    const user = userEvent.setup();
    render(<ClientProfilePanel profile={profile()} />);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  it("surfaces a rejected save inline instead of failing silently", async () => {
    mockedUpdate.mockRejectedValueOnce(new Error("dateOfBirth cannot be in the future."));
    const user = userEvent.setup();
    render(<ClientProfilePanel profile={profile()} />);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("dateOfBirth cannot be in the future.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
