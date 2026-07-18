"use client";

export type ClientStatus = "Active" | "Onboarding" | "Pending documents" | "Inactive";

export interface Client {
  id: string;
  name: string;
  email: string;
  property: string;
  status: ClientStatus;
  joinedDate: string;
}

// Hardcoded mock data — no database or API calls. Shapes follow the multi-tenant
// `clients` table described in ARCHITECTURE.md (tenant_id omitted here; this is
// display-only data for a single tenant's admin view).
export const MOCK_CLIENTS: Client[] = [
  {
    id: "c_1001",
    name: "Maria Papadopoulos",
    email: "maria.p@example.com",
    property: "Villa Elytra — Chania, Crete",
    status: "Active",
    joinedDate: "14 Mar 2026",
  },
  {
    id: "c_1002",
    name: "Dimitris Anagnostou",
    email: "d.anagnostou@example.com",
    property: "Villa Thalassa — Rethymno, Crete",
    status: "Onboarding",
    joinedDate: "2 Jun 2026",
  },
  {
    id: "c_1003",
    name: "Elena Vasquez",
    email: "elena.vasquez@example.com",
    property: "Apartment Kolonaki — Athens",
    status: "Pending documents",
    joinedDate: "29 Jun 2026",
  },
  {
    id: "c_1004",
    name: "Andreas Konstantinou",
    email: "andreas.k@example.com",
    property: "Villa Ammos — Paros",
    status: "Active",
    joinedDate: "9 Jan 2026",
  },
  {
    id: "c_1005",
    name: "Sophie Laurent",
    email: "sophie.laurent@example.com",
    property: "Townhouse Nafplio",
    status: "Inactive",
    joinedDate: "17 Aug 2025",
  },
];

const STATUS_TONE: Record<ClientStatus, string> = {
  Active: "bg-olive-100 text-olive-700",
  Onboarding: "bg-aegean-50 text-aegean-700",
  "Pending documents": "bg-sun-100 text-sun-700",
  Inactive: "bg-stone-100 text-stone-700",
};

export interface ClientTableProps {
  clients?: Client[];
  onViewClient?: (clientId: string) => void;
}

export function ClientTable({ clients = MOCK_CLIENTS, onViewClient }: ClientTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-0 shadow-sm">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-xs font-semibold uppercase tracking-wide text-stone-500">
            <th scope="col" className="px-5 py-3">Client</th>
            <th scope="col" className="px-5 py-3">Property</th>
            <th scope="col" className="px-5 py-3">Status</th>
            <th scope="col" className="px-5 py-3">Joined</th>
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
                <div className="text-xs text-stone-500">{client.email}</div>
              </td>
              <td className="px-5 py-4 text-stone-700">{client.property}</td>
              <td className="px-5 py-4">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_TONE[client.status]}`}
                >
                  {client.status}
                </span>
              </td>
              <td className="px-5 py-4 text-stone-500">{client.joinedDate}</td>
              <td className="px-5 py-4 text-right">
                <button
                  type="button"
                  onClick={() => onViewClient?.(client.id)}
                  className="rounded-md px-3 py-1.5 text-sm font-semibold text-aegean-600 transition-colors hover:bg-aegean-50"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
