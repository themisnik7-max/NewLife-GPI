"use client";

import { useState } from "react";
import {
  ADMIN_BUTTON_CLASS,
  ADMIN_FIELD_CLASS,
  AdminError,
  AdminField,
  AdminSection,
  useAdminAction,
} from "@/components/ui/adminControls";
import { updateClientProfileAction } from "./actions";
import type { ClientProfile } from "@/lib/data/clients";

/**
 * The admin-maintained half of a client profile.
 *
 * Name and email are shown but not editable: Clerk owns them and syncs them
 * by webhook, so an input here would either be ignored or create a second
 * source of truth that drifts from the identity provider.
 *
 * Admin notes are visually separated and labelled as internal. That label is
 * the only thing telling an admin the client cannot see them — the actual
 * enforcement is getOwnClientProfile() in src/lib/data/clients.ts, which is a
 * separate function precisely so the field cannot leak through a wrong flag.
 */

interface ClientProfilePanelProps {
  profile: ClientProfile;
}

export function ClientProfilePanel({ profile }: ClientProfilePanelProps) {
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [nationality, setNationality] = useState(profile.nationality ?? "");
  const [passportNumber, setPassportNumber] = useState(profile.passportNumber ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth ?? "");
  const [adminNotes, setAdminNotes] = useState(profile.adminNotes ?? "");
  const [saved, setSaved] = useState(false);
  const { error, isPending, run } = useAdminAction();

  function submit() {
    setSaved(false);
    run(
      () =>
        // Every field is sent on every save, including empty ones, so
        // clearing a value actually clears it. The data layer converts
        // whitespace-only input to null so "unset" has one representation.
        updateClientProfileAction(profile.id, {
          phone,
          nationality,
          passportNumber,
          dateOfBirth: dateOfBirth.trim() === "" ? null : dateOfBirth,
          adminNotes,
        }),
      () => setSaved(true),
    );
  }

  return (
    <AdminSection title="Client profile">
      <AdminError message={error} />

      <dl className="mb-4 grid gap-3 border-b border-stone-100 pb-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-stone-500">Name</dt>
          <dd className="text-stone-900">{profile.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Email</dt>
          <dd className="text-stone-900">{profile.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Joined</dt>
          <dd className="text-stone-900">{profile.joinedDate}</dd>
        </div>
      </dl>
      <p className="mb-4 text-xs text-stone-500">
        Name and email come from the client&apos;s sign-in account and are not editable here.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Not recorded"
            className={ADMIN_FIELD_CLASS}
          />
        </AdminField>
        <AdminField label="Nationality">
          <input
            value={nationality}
            onChange={(event) => setNationality(event.target.value)}
            placeholder="Not recorded"
            className={ADMIN_FIELD_CLASS}
          />
        </AdminField>
        <AdminField label="Passport / ID number">
          <input
            value={passportNumber}
            onChange={(event) => setPassportNumber(event.target.value)}
            placeholder="Not recorded"
            className={ADMIN_FIELD_CLASS}
          />
        </AdminField>
        <AdminField label="Date of birth">
          <input
            type="date"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            className={ADMIN_FIELD_CLASS}
          />
        </AdminField>
      </div>

      <div className="mt-4 rounded-md bg-stone-50 p-3">
        <AdminField label="Internal notes — not visible to the client">
          <textarea
            rows={3}
            value={adminNotes}
            onChange={(event) => setAdminNotes(event.target.value)}
            placeholder="Context for your team only."
            className={ADMIN_FIELD_CLASS}
          />
        </AdminField>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={submit} disabled={isPending} className={ADMIN_BUTTON_CLASS}>
          {isPending ? "Saving…" : "Save profile"}
        </button>
        {saved && !isPending && (
          <span role="status" className="text-sm text-olive-700">
            Saved
          </span>
        )}
      </div>
    </AdminSection>
  );
}
