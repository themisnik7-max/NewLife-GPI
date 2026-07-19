export interface Project {
  id: string;
  name: string;
  address: string;
  area: string;
  units: number;
  availableUnits: number;
  deliveryDate: string;
  contractDate: string;
  floor: string;
  sqm: number;
  energyClass: string;
  pptUrl: string;
}

// Hardcoded mock data — no database or API calls.
export const MOCK_PROJECTS: Project[] = [
  {
    id: "aegean-breeze-residences",
    name: "Aegean Breeze Residences",
    address: "Naoussa, Paros, Greece",
    area: "Paros",
    units: 12,
    availableUnits: 5,
    deliveryDate: "2027-03-01",
    contractDate: "2026-01-15",
    floor: "1-3",
    sqm: 92,
    energyClass: "A",
    pptUrl:
      "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Faegean-breeze-residences.pptx",
  },
  {
    id: "olive-grove-villas",
    name: "Olive Grove Villas",
    address: "Rethymno, Crete, Greece",
    area: "Rethymno",
    units: 6,
    availableUnits: 2,
    deliveryDate: "2026-11-20",
    contractDate: "2025-09-10",
    floor: "Ground + 1",
    sqm: 145,
    energyClass: "A+",
    pptUrl:
      "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Folive-grove-villas.pptx",
  },
  {
    id: "athens-riviera-lofts",
    name: "Athens Riviera Lofts",
    address: "Glyfada, Athens, Greece",
    area: "Athens",
    units: 24,
    availableUnits: 9,
    deliveryDate: "2027-06-15",
    contractDate: "2026-02-01",
    floor: "2-6",
    sqm: 78,
    energyClass: "B",
    pptUrl:
      "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Fathens-riviera-lofts.pptx",
  },
  {
    id: "nafplio-heritage-homes",
    name: "Nafplio Heritage Homes",
    address: "Nafplio, Peloponnese, Greece",
    area: "Nafplio",
    units: 8,
    availableUnits: 1,
    deliveryDate: "2026-09-30",
    contractDate: "2025-05-20",
    floor: "1-2",
    sqm: 110,
    energyClass: "A",
    pptUrl:
      "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Fnafplio-heritage-homes.pptx",
  },
  {
    id: "santorini-caldera-suites",
    name: "Santorini Caldera Suites",
    address: "Oia, Santorini, Greece",
    area: "Santorini",
    units: 10,
    availableUnits: 3,
    deliveryDate: "2027-05-01",
    contractDate: "2026-04-12",
    floor: "1",
    sqm: 65,
    energyClass: "A",
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
  units: 1,
  availableUnits: 0,
  deliveryDate: "2026-12-15",
  contractDate: "2026-03-14",
  floor: "Ground + 1",
  sqm: 185,
  energyClass: "A",
  pptUrl:
    "https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fnewlifegpi.example.com%2Fdecks%2Fvilla-elytra.pptx",
};
