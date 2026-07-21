// Client/test-safe: types and hardcoded mock data only. No database or API
// calls happen here, and nothing in this file is Node-only, so it remains
// safely importable from Client Components and from Vitest. The actual
// Prisma-backed data fetch lives in src/lib/data/projects.ts, which is
// guarded with `server-only` — it cannot be imported from this file or
// anything that (transitively) reaches a Client Component, which is exactly
// why the fetching logic is kept out of here.
//
// Shape matches prisma/schema.prisma's Property model field-for-field
// (previously used `units`/`floor: string`, which could not represent real
// Property rows at all — see LOGS.md's architecture-gap audit entry).

export type PropertyStatus = "PLANNING" | "UNDER_CONSTRUCTION" | "COMPLETED";

export interface Project {
  id: string;
  name: string;
  address: string;
  area: string;
  totalUnits: number;
  availableUnits: number;
  deliveryDate: string;
  contractDate: string;
  floor: number;
  sqm: number;
  energyClass: string;
  imageUrl: string;
  status: PropertyStatus;
  mapUrl: string;
  pptUrl: string | null;
}

function buildMapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function buildPlaceholderImageUrl(label: string): string {
  return `https://placehold.co/800x450?text=${encodeURIComponent(label)}`;
}

// Hardcoded mock data — no database or API calls.
export const MOCK_PROJECTS: Project[] = [
  {
    id: "aegean-breeze-residences",
    name: "Aegean Breeze Residences",
    address: "Naoussa, Paros, Greece",
    area: "Paros",
    totalUnits: 12,
    availableUnits: 5,
    deliveryDate: "2027-03-01",
    contractDate: "2026-01-15",
    floor: 2,
    sqm: 92,
    energyClass: "A",
    imageUrl: buildPlaceholderImageUrl("Aegean Breeze Residences"),
    status: "UNDER_CONSTRUCTION",
    mapUrl: buildMapUrl("Naoussa, Paros, Greece"),
    pptUrl:
      "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Faegean-breeze-residences.pptx",
  },
  {
    id: "olive-grove-villas",
    name: "Olive Grove Villas",
    address: "Rethymno, Crete, Greece",
    area: "Rethymno",
    totalUnits: 6,
    availableUnits: 2,
    deliveryDate: "2026-11-20",
    contractDate: "2025-09-10",
    floor: 0,
    sqm: 145,
    energyClass: "A+",
    imageUrl: buildPlaceholderImageUrl("Olive Grove Villas"),
    status: "UNDER_CONSTRUCTION",
    mapUrl: buildMapUrl("Rethymno, Crete, Greece"),
    pptUrl:
      "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Folive-grove-villas.pptx",
  },
  {
    id: "athens-riviera-lofts",
    name: "Athens Riviera Lofts",
    address: "Glyfada, Athens, Greece",
    area: "Athens",
    totalUnits: 24,
    availableUnits: 9,
    deliveryDate: "2027-06-15",
    contractDate: "2026-02-01",
    floor: 4,
    sqm: 78,
    energyClass: "B",
    imageUrl: buildPlaceholderImageUrl("Athens Riviera Lofts"),
    status: "PLANNING",
    mapUrl: buildMapUrl("Glyfada, Athens, Greece"),
    pptUrl:
      "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Fathens-riviera-lofts.pptx",
  },
  {
    id: "nafplio-heritage-homes",
    name: "Nafplio Heritage Homes",
    address: "Nafplio, Peloponnese, Greece",
    area: "Nafplio",
    totalUnits: 8,
    availableUnits: 1,
    deliveryDate: "2026-09-30",
    contractDate: "2025-05-20",
    floor: 1,
    sqm: 110,
    energyClass: "A",
    imageUrl: buildPlaceholderImageUrl("Nafplio Heritage Homes"),
    status: "COMPLETED",
    mapUrl: buildMapUrl("Nafplio, Peloponnese, Greece"),
    pptUrl:
      "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Fnafplio-heritage-homes.pptx",
  },
  {
    id: "santorini-caldera-suites",
    name: "Santorini Caldera Suites",
    address: "Oia, Santorini, Greece",
    area: "Santorini",
    totalUnits: 10,
    availableUnits: 3,
    deliveryDate: "2027-05-01",
    contractDate: "2026-04-12",
    floor: 1,
    sqm: 65,
    energyClass: "A",
    imageUrl: buildPlaceholderImageUrl("Santorini Caldera Suites"),
    status: "PLANNING",
    mapUrl: buildMapUrl("Oia, Santorini, Greece"),
    pptUrl:
      "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Fsantorini-caldera-suites.pptx",
  },
];

// The logged-in client's own unit — separate from the browsable catalog above.
export const MOCK_OWNED_PROPERTY: Project = {
  id: "villa-elytra",
  name: "Villa Elytra",
  address: "Chania, Crete, Greece",
  area: "Chania",
  totalUnits: 1,
  availableUnits: 0,
  deliveryDate: "2026-12-15",
  contractDate: "2026-03-14",
  floor: 0,
  sqm: 185,
  energyClass: "A",
  imageUrl: buildPlaceholderImageUrl("Villa Elytra"),
  status: "UNDER_CONSTRUCTION",
  mapUrl: buildMapUrl("Chania, Crete, Greece"),
  pptUrl:
    "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Fvilla-elytra.pptx",
};
