import Link from "next/link";
import { formatCurrency, formatProgress } from "@/lib/format";
import type { ClientDirectoryEntry } from "@/lib/data/clients";

/**
 * The admin Clients roster.
 *
 * Distinct from ClientTable, which it does not replace: that component still
 * backs narrower views and carries a `status` column with no real signal
 * behind it (see getTenantClients()'s comment on why "Active" is hardcoded).
 * This one shows only facts the database can actually answer for, and adds
 * each client's position in every workflow so an admin can see who needs
 * attention without opening five profiles.
 */

interface ClientDirectoryProps {
  clients: ClientDirectoryEntry[];
}

/** Renders a value, or a visually muted placeholder when it is not recorded. */
function Value({ children }: { children: string | null }) {
  if (!children) return <span className="text-stone-400">—</span>;
  return <>{children}</>;
}

export function ClientDirectory({ clients }: ClientDirectoryProps) {
  if (clients.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No clients yet. Invite one from the Team page and they will appear here once they accept.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-0 shadow-sm">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-xs font-semibold uppercase tracking-wide text-stone-500">
            <th scope="col" className="px-5 py-3">Client</th>
            <th scope="col" className="px-5 py-3">Contact</th>
            <th scope="col" className="px-5 py-3">Property</th>
            <th scope="col" className="px-5 py-3">Golden Visa</th>
            <th scope="col" className="px-5 py-3">Rental</th>
            <th scope="col" className="px-5 py-3 text-right">Outstanding</th>
            <th scope="col" className="px-5 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id} className="border-b border-stone-100 last:border-0">
              <td className="px-5 py-4">
                <div className="font-medium text-stone-900">{client.name}</div>
                <div className="text-xs text-stone-500">Joined {client.joinedDate}</div>
              </td>
              <td className="px-5 py-4">
                <div className="text-stone-700">{client.email}</div>
                <div className="text-xs text-stone-500">
                  <Value>{client.phone}</Value>
                  {client.nationality ? ` · ${client.nationality}` : ""}
                </div>
              </td>
              <td className="px-5 py-4 text-stone-700">
                <Value>{client.property}</Value>
              </td>
              <td className="px-5 py-4 tabular-nums text-stone-700">
                {/* A client with no steps created yet reads "Not started"
                    rather than "0 of 0", which looks like a stalled process
                    when it is actually an unbegun one. */}
                {client.visa.total === 0 ? (
                  <span className="text-stone-400">Not started</span>
                ) : (
                  formatProgress(client.visa.completed, client.visa.total)
                )}
              </td>
              <td className="px-5 py-4 tabular-nums text-stone-700">
                {client.rental.completed === 0 ? (
                  <span className="text-stone-400">Not started</span>
                ) : (
                  formatProgress(client.rental.completed, client.rental.total)
                )}
              </td>
              <td className="px-5 py-4 text-right tabular-nums">
                <span className={client.outstanding > 0 ? "font-semibold text-stone-900" : "text-stone-400"}>
                  {formatCurrency(client.outstanding)}
                </span>
              </td>
              <td className="px-5 py-4 text-right">
                <Link
                  href={`/dashboard/clients/${client.id}`}
                  className="rounded-md px-3 py-1.5 text-sm font-semibold text-aegean-600 transition-colors hover:bg-aegean-50"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
