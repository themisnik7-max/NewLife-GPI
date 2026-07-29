// Client/test-safe: the pipeline vocabulary and the pure functions over it.
// No database access, so this is importable from Client Components — the
// Prisma-backed layer lives in src/lib/data/pipeline.ts (`server-only`).
//
// Same split as src/lib/rentalStages.ts, src/lib/documents.ts and
// src/lib/activities.ts.

/**
 * The acquisition funnel, as this business actually runs it:
 *
 *     lead → zoom meeting → athens visit → power of attorney → buyer
 *
 * ⚠️ THIS REPLACED A GENERIC SALES FUNNEL, and the reason is worth keeping.
 * The original stages here were NEW_LEAD / QUALIFIED / VIEWING / OFFER /
 * RESERVATION / CONTRACT / WON / LOST — lifted from a standard B2B CRM
 * template and describing a process this business does not run. A Golden
 * Visa purchase has no "proposal" and no "reservation"; it has a video call,
 * a trip to Athens, a notarised power of attorney, and a completed purchase.
 * Stages that do not match the real process do not merely mislabel the board
 * — they make every conversion metric measure something nobody does.
 */
export type DealStageKey =
  | "LEAD"
  | "ZOOM_MEETING"
  | "ATHENS_VISIT"
  | "POWER_OF_ATTORNEY"
  | "BUYER"
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
   *
   * The curve is steeper than the generic one it replaced, deliberately.
   * Someone who has flown to Athens to look at apartments is materially more
   * likely to buy than someone at the equivalent step of a software sale, and
   * a notarised power of attorney is close to a commitment.
   */
  probability: number;
  /** BUYER and LOST are terminal — a deal there has left the board. */
  isClosed?: boolean;
  isWon?: boolean;
  /**
   * The document that evidences this stage, where one exists.
   *
   * A power of attorney is not merely a status someone ticks: it is a
   * notarised instrument that either exists or does not. Recording which
   * stages have a paper trail lets the UI say "this deal claims a POA but
   * none is on file", which is the discrepancy worth surfacing.
   *
   * Deliberately a WARNING and not a hard gate — see hasRequiredDocument()'s
   * callers. Blocking the stage change would make backfilling historical
   * deals impossible and would be worked around by mis-staging them, which
   * is worse than an honest flag.
   */
  requiredDocumentCategory?: string;
}

/**
 * The six stages, in order. Unlike the document category list, this one is
 * mirrored by a database check constraint (0013_pipeline.sql, amended by
 * 0015): the stages are the spine of the board, and a typo'd value would
 * silently create a phantom column that nothing renders and no query finds.
 * Changing this list therefore requires a migration, deliberately.
 */
export const DEAL_STAGES: ReadonlyArray<DealStageDefinition> = [
  { key: "LEAD", label: "Lead", order: 1, probability: 0.1 },
  { key: "ZOOM_MEETING", label: "Zoom meeting", order: 2, probability: 0.25 },
  { key: "ATHENS_VISIT", label: "Athens visit", order: 3, probability: 0.5 },
  {
    key: "POWER_OF_ATTORNEY",
    label: "Power of attorney",
    order: 4,
    probability: 0.85,
    requiredDocumentCategory: "POWER_OF_ATTORNEY",
  },
  {
    key: "BUYER",
    label: "Buyer",
    order: 5,
    probability: 1,
    isClosed: true,
    isWon: true,
    // The signed contract is what makes someone a buyer rather than someone
    // who intended to be one.
    requiredDocumentCategory: "SALE_CONTRACT",
  },
  { key: "LOST", label: "Lost", order: 6, probability: 0, isClosed: true },
];

/** The stage a deal reaching the end of the funnel lands on. Named rather
 * than written as a literal at each call site, because "won" and "BUYER" are
 * now different words for the same thing and the drift is easy to miss. */
export const WON_STAGE: DealStageKey = "BUYER";
export const LOST_STAGE: DealStageKey = "LOST";

/** Where a new deal starts. Also named rather than inlined — the previous
 * funnel's first stage was hard-coded as the string "NEW_LEAD" in three
 * separate files, all of which had to be found by grep when it changed. */
export const FIRST_STAGE: DealStageKey = "LEAD";

/** The two terminal stages, for `notIn` filters. Exported so a query that
 * means "open deals" cannot fall out of step with the stage list. */
export const CLOSED_STAGE_KEYS: readonly DealStageKey[] = [WON_STAGE, LOST_STAGE];

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

/**
 * The document category a stage expects, or null.
 *
 * Separate from the definition lookup so callers do not have to know that
 * `requiredDocumentCategory` is optional, and so the "no document needed"
 * answer for an unknown stage is null rather than undefined.
 */
export function requiredDocumentFor(stageKey: string): string | null {
  return DEAL_STAGE_BY_KEY.get(stageKey)?.requiredDocumentCategory ?? null;
}

/**
 * Whether a deal at this stage has the paperwork the stage implies.
 *
 * Returns true when the stage needs nothing, so a caller can use this
 * uniformly without first asking whether the question applies. A stage that
 * requires a document and does not have one is a discrepancy to surface, not
 * an error to throw: the deal is legitimately at that stage in the business's
 * own judgement, and the system's job is to say the file is incomplete.
 */
export function hasRequiredDocument(
  stageKey: string,
  documentCategories: readonly string[],
): boolean {
  const required = requiredDocumentFor(stageKey);
  if (!required) return true;
  return documentCategories.includes(required);
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
  /**
   * Document categories filed against this deal.
   *
   * Categories, not documents: the board only ever asks "is a POA on file",
   * never "which POA". Carrying the full document rows would mean fetching
   * filenames, sizes and uploader names for every card on the board to answer
   * a yes/no question.
   */
  documentCategories: string[];
}

/**
 * A deal whose stage claims paperwork that is not on file.
 *
 * The discrepancy the board surfaces: someone has moved a card to "Power of
 * attorney" but no POA has been uploaded. Not an error — the deal may
 * legitimately be there in the business's judgement, and the document may be
 * sitting in someone's inbox. The system's job is to say the file is
 * incomplete, not to argue about it.
 */
export function isMissingRequiredDocument(deal: DealView): boolean {
  return !hasRequiredDocument(deal.stage, deal.documentCategories);
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
  const won = deals.filter((deal) => deal.stage === WON_STAGE);

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
    lostCount: deals.filter((deal) => deal.stage === LOST_STAGE).length,
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
