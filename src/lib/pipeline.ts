// Client/test-safe: the pipeline vocabulary and the pure functions over it.
// No database access, so this is importable from Client Components — the
// Prisma-backed layer lives in src/lib/data/pipeline.ts (`server-only`).
//
// Same split as src/lib/rentalStages.ts, src/lib/documents.ts and
// src/lib/activities.ts.

export type DealStageKey =
  | "NEW_LEAD"
  | "QUALIFIED"
  | "VIEWING"
  | "OFFER"
  | "RESERVATION"
  | "CONTRACT"
  | "WON"
  | "LOST";

export interface DealStageDefinition {
  key: DealStageKey;
  label: string;
  order: number;
  /**
   * Probability of closing, 0–1, used for the weighted forecast.
   *
   * These are defaults, not measurements. Stated plainly because a forecast
   * built on them looks authoritative and is not: until there is enough
   * closed-deal history to derive real conversion rates per stage, this is
   * an assumption the business should be able to see and argue with rather
   * than a number the system discovered.
   */
  probability: number;
  /** WON and LOST are terminal — a deal there has left the pipeline. */
  isClosed?: boolean;
  isWon?: boolean;
}

/**
 * The eight stages, in order. Unlike the document category list, this one is
 * mirrored by a database check constraint (0013_pipeline.sql): the stages are
 * the spine of the board, and a typo'd value would silently create a phantom
 * column that nothing renders and no query finds. Adding a stage therefore
 * requires a migration, deliberately.
 */
export const DEAL_STAGES: ReadonlyArray<DealStageDefinition> = [
  { key: "NEW_LEAD", label: "New lead", order: 1, probability: 0.1 },
  { key: "QUALIFIED", label: "Qualified", order: 2, probability: 0.2 },
  { key: "VIEWING", label: "Viewing", order: 3, probability: 0.35 },
  { key: "OFFER", label: "Offer", order: 4, probability: 0.5 },
  { key: "RESERVATION", label: "Reservation", order: 5, probability: 0.7 },
  { key: "CONTRACT", label: "Contract", order: 6, probability: 0.9 },
  { key: "WON", label: "Won", order: 7, probability: 1, isClosed: true, isWon: true },
  { key: "LOST", label: "Lost", order: 8, probability: 0, isClosed: true },
];

export const DEAL_STAGE_BY_KEY: ReadonlyMap<string, DealStageDefinition> = new Map(
  DEAL_STAGES.map((stage) => [stage.key, stage]),
);

/** The six stages a deal can actually sit in and still be live. */
export const OPEN_DEAL_STAGES: ReadonlyArray<DealStageDefinition> = DEAL_STAGES.filter(
  (stage) => !stage.isClosed,
);

export function isKnownDealStage(key: string): key is DealStageKey {
  return DEAL_STAGE_BY_KEY.has(key);
}

export function dealStageLabel(key: string): string {
  return DEAL_STAGE_BY_KEY.get(key)?.label ?? key;
}

export function isClosedStage(key: string): boolean {
  return DEAL_STAGE_BY_KEY.get(key)?.isClosed ?? false;
}

export interface DealView {
  id: string;
  title: string;
  stage: DealStageKey;
  stageLabel: string;
  value: number | null;
  expectedCloseDate: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  position: number;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  /** Set once the contact has a real account — see Contact.clerkUserId. */
  contactClerkUserId: string | null;
  propertyId: string | null;
  propertyName: string | null;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactView {
  id: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  source: string | null;
  notes: string | null;
  clerkUserId: string | null;
  ownerUserId: string | null;
  createdAt: string;
  /** Open deals only — a converted client's closed history is not a count
   * anyone reads on a contact row. */
  openDealCount: number;
}

export function contactFullName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

// ── Board arithmetic ────────────────────────────────────────────────

export interface StageColumn {
  stage: DealStageDefinition;
  deals: DealView[];
  /** Sum of known values in this column. */
  total: number;
  /** How many deals here carry no value — the gap in `total`. */
  missingValueCount: number;
}

/**
 * Splits deals into board columns.
 *
 * Every open stage gets a column even when empty: an empty "Offer" column is
 * information ("nothing is at offer"), whereas hiding it makes the board
 * silently change shape as deals move and gives nowhere to drop a card.
 *
 * `missingValueCount` travels alongside `total` rather than being folded into
 * it, the same pattern getTenantMetrics() uses for `salesMissingPrice`: a
 * column total that quietly excludes three unpriced deals is a number that
 * lies by omission.
 */
export function buildStageColumns(
  deals: readonly DealView[],
  stages: readonly DealStageDefinition[] = OPEN_DEAL_STAGES,
): StageColumn[] {
  return stages.map((stage) => {
    const inStage = deals
      .filter((deal) => deal.stage === stage.key)
      .sort((a, b) => a.position - b.position);

    return {
      stage,
      deals: inStage,
      total: inStage.reduce((sum, deal) => sum + (deal.value ?? 0), 0),
      missingValueCount: inStage.filter((deal) => deal.value === null).length,
    };
  });
}

export interface PipelineForecast {
  /** Sum of every open deal's value, unweighted. */
  openValue: number;
  /** Each open deal's value × its stage probability. */
  weightedValue: number;
  openCount: number;
  /** Open deals carrying no value — the gap in both figures above. */
  missingValueCount: number;
  wonValue: number;
  wonCount: number;
  lostCount: number;
}

/**
 * The forecast panel's figures.
 *
 * Weighted value uses the stage probabilities above, which are assumptions
 * rather than measurements — see DealStageDefinition.probability. The UI says
 * so where it renders this, because a number like "€412,000 weighted" reads
 * as a fact and is not one.
 */
export function calculateForecast(deals: readonly DealView[]): PipelineForecast {
  const open = deals.filter((deal) => !isClosedStage(deal.stage));
  const won = deals.filter((deal) => deal.stage === "WON");

  return {
    openValue: open.reduce((sum, deal) => sum + (deal.value ?? 0), 0),
    weightedValue: open.reduce(
      (sum, deal) => sum + (deal.value ?? 0) * (DEAL_STAGE_BY_KEY.get(deal.stage)?.probability ?? 0),
      0,
    ),
    openCount: open.length,
    missingValueCount: open.filter((deal) => deal.value === null).length,
    wonValue: won.reduce((sum, deal) => sum + (deal.value ?? 0), 0),
    wonCount: won.length,
    lostCount: deals.filter((deal) => deal.stage === "LOST").length,
  };
}

/** Spacing between cards when a column is built from scratch. */
const POSITION_STEP = 1000;

/**
 * The position value for a card dropped at `index` within a column.
 *
 * Returns the midpoint between its new neighbours, which is why `position` is
 * a float: only the dragged row is rewritten, no matter where it lands.
 * Integer positions would mean renumbering every card below the insertion
 * point on every drag — one write becomes N.
 *
 * `siblings` must exclude the card being moved. Passing it in would let the
 * card become its own neighbour and compute a midpoint against itself.
 */
export function positionForIndex(siblings: readonly { position: number }[], index: number): number {
  if (siblings.length === 0) return POSITION_STEP;

  const clamped = Math.max(0, Math.min(index, siblings.length));

  if (clamped === 0) return siblings[0].position - POSITION_STEP;
  if (clamped === siblings.length) return siblings[siblings.length - 1].position + POSITION_STEP;

  return (siblings[clamped - 1].position + siblings[clamped].position) / 2;
}
