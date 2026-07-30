# BACKLOG.md — Outstanding work and open decisions

Everything identified but **not yet done**, as of 2026-07-29. This is the
companion to LOGS.md: that file records what happened, this one records what
has not happened yet and why.

Written after the six-phase CRM expansion landed on branch
`feat/crm-platform-expansion` (commit `fd6cab2`). Items are grouped by whether
they **block use of what already exists** or **extend it**.

---

## 0. BLOCKERS — nothing new works until these are done

> **Status 2026-07-30.** Phase A is complete in code (A1-A5 shipped). Both
> blockers below remain, and BOTH are now the owner's to clear — the
> assistant has no way to do either. Until they are, the live app is
> unchanged from where it started.
>
> ### 0.0 File storage is NOT configured — uploads will fail
>
> `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are absent from `.env` and
> `.env.local`; they appear only in `.env.example`. `isStorageConfigured()`
> therefore returns false, and every Files panel renders "File storage is not
> configured" instead of an upload control.
>
> This matters because uploading PDFs and images was an explicit requirement.
> The document tables and UI are built and tested, but **no file can actually
> be stored until these two variables are set and a PRIVATE Supabase bucket
> named `rental-documents` exists** (Storage → New bucket, "Public bucket"
> OFF). The feature degrades honestly rather than erroring, which is why it is
> easy to miss.

### 0.1 Migrations 0010–0015 are not applied

`prisma/schema.prisma` and the generated client are ahead of the live database.
Five migrations exist in `supabase/migrations/` and have **never been run**:

| File | Creates |
|---|---|
| `0010_documents.sql` | `documents` |
| `0011_activities.sql` | `activities` |
| `0012_saved_views.sql` | `saved_views` |
| `0013_pipeline.sql` | `contacts`, `deals` |
| `0014_automation_rules.sql` | `automation_rules` |
| `0015_pipeline_real_funnel.sql` | rewrites `deals.stage` (see 4.4 D2) |

`scripts/apply-migrations.mjs` applies them in order over `DIRECT_URL`,
stopping at the first failure and naming it. `node scripts/apply-migrations.mjs
--dry-run` lists what would run; `--from 0010` skips the nine already applied.
The assistant cannot run it — the sandbox blocks writing schema changes to a
live database, correctly.

**Consequence, stated precisely:** every page whose loader touches one of these
tables fails at request time, because Prisma issues a query against a relation
that does not exist. That includes `/dashboard` (reads `activities` via
`getOpenTasks`), `/dashboard/clients` (reads `saved_views`),
`/dashboard/pipeline`, and `/dashboard/automations`. Pages that touch none of
them — notably `/dashboard/property` — still render normally, which is why the
app can look "mostly fine" while most of the new work is unreachable.

Run them in numeric order. Order matters: `0013` references `properties` and
`users`, `0014` references `users`.

### 0.2 Work is on a branch, not on `main`

`feat/crm-platform-expansion` is pushed to origin. `main` is untouched, so
**Vercel has not deployed any of it**. Merging is a deliberate decision and has
not been made.

---

## 1. GAPS IN WHAT WAS BUILT — found, acknowledged, not fixed

### 1.1 Properties Sold is incomplete (user-reported, confirmed in code)

`/dashboard/property` (admin branch) renders `SoldPropertiesTable` and nothing
else. `/dashboard/property/[propertyId]` renders the asset card, the sale
editor, and construction milestones. Neither has:

- **A file panel.** `DocumentPanel` was wired into the *client-facing* branch
  of `/dashboard/property` and into `/dashboard/projects/[id]`, but not into
  either admin sold-property view. There is therefore no way to attach a
  signed contract, a deed, or a handover photo to a unit the business has
  actually sold — which is the single most document-heavy record in the app.
  This was an oversight, not a design decision.
- **An activity timeline.** Same omission on the drill-down.
- **Any way to record a sale from the page you are looking at.** The only
  existing path is: create the property under `/dashboard/projects/new` →
  open the buyer's profile at `/dashboard/clients/[userId]` → assign the
  property → return to `/dashboard/property/[propertyId]` to set price and
  date. Three pages and a return trip for one business event.

### 1.2 No spreadsheet import anywhere

There is no way to bring existing sales data, properties, or contacts in from
Excel or CSV. Every record must be typed in by hand. For a business with a
back catalogue of sold units this makes the app unusable as a system of record
until the history is in it.

Blocked on a dependency decision — see §3.1.

### 1.3 The view toolbar reaches one table

`ViewToolbar` + `applyView` are generic and tested, but wired only into the
client roster (`ClientRoster.tsx`). Payments, rentals, properties sold, visa,
and construction are still fixed server-rendered tables with no search, filter,
sort, or grouping. The engine is done; the wiring per page is not.

### 1.4 `PaymentLedger.amount` is still `Float`

Flagged in the original analysis and deliberately left alone rather than
migrated as a side effect of unrelated work. Every newer money column
(`salePrice`, `offerPrice`, `Deal.value`) is `Decimal`. Until this is
converted, any revenue or forecast figure computed from the ledger carries
binary floating-point rounding error in its headline number. Converting it is
a data migration and a decision about historical rows, not a refactor.

### 1.5 `sales.missingPrice` gap is surfaced but not closed

`getTenantMetrics()` correctly reports how many ownership rows have no sale
price, and the UI shows it. Nothing has been done to actually fill those rows.
Any forecasting built on top of sale value silently averages over the gap.

---

## 2. OPEN DECISIONS — mine to raise, yours to make

### 2.1 CLAUDE.md's `temperature: 0.0` rule vs. the current API

**The conflict:** CLAUDE.md states, as non-negotiable, that every user-facing
LLM request sets `temperature: 0.0`. Claude Opus 5, Opus 4.8 and Opus 4.7
**removed** `temperature` — a request carrying it is rejected with HTTP 400.
Both cannot hold on a current model.

**What was implemented:** the policy lives in exactly one place,
`determinismParamsFor()` in `src/lib/ai/models.ts`. On a model that accepts
`temperature` it sends `temperature: 0`. On a model that removed it, it sends
`output_config: { effort: "low" }` — Anthropic's documented replacement for
this exact intent, and the lever that also serves the rule's second stated
reason, cost control. Which form was used is recorded in `AiLog.metadata` on
every call, so past calls stay auditable.

**Still open:** whether to (a) leave it as is, (b) set `AI_MODEL` to
`claude-opus-4-6` or `claude-sonnet-4-6` so the literal parameter is sent —
no code change needed — or (c) amend CLAUDE.md to describe the intent rather
than the parameter. **CLAUDE.md has not been edited.** It is the project's
behavioural contract and changing it is not mine to do unilaterally.

### 2.2 Raw `fetch` instead of the Anthropic SDK

`src/lib/ai/client.ts` calls the Messages API over `fetch` rather than
`@anthropic-ai/sdk`. The SDK is the better client. It was not used because
CLAUDE.md fixes the dependency set and requires explicit approval to add
anything. Swapping it in touches only that one file.

### 2.3 Notifications are in-app only

`Notification` rows and the TopNav bell. No email delivery — that needs a
provider dependency (Resend, Postmark, SES), which is the same approval gate.

---

## 3. NOT STARTED — the monday-analogous plan

Ordering reflects what blocks real use, not what is most interesting to build.

### Phase A — close the gaps in §1.1–1.2

- **A1** `DocumentPanel` + `ActivityTimeline` on both admin sold-property views.
- **A2** A single "Record a sale" dialog: pick or create property, pick or
  create buyer, enter price and date, attach the contract — one action.
- **A3** Spreadsheet import with column mapping, preview, validation and a
  dry-run, for sold properties / properties / contacts.
  **Blocked on §3.1.**

### Phase B — the board paradigm

- **B1** View switcher (Table / Kanban / Calendar / Gallery) on every table,
  reusing `views.ts` and `saved_views`. Closes §1.3.
- **B2** Calendar view over payment due dates, delivery dates, visa deadlines
  and task due dates.
- **B3** Gantt/timeline over construction milestones — the data already exists
  in `construction_milestones`.
- **B4** Chart widgets over the figures `getTenantMetrics()` already computes.

### Phase C — integrations

- **C1** Email (Gmail/Outlook): send from a client record, auto-log to the
  timeline. Largest single CRM gap.
- **C2** E-signature (DocuSign): send the SPA, track status, file the signed
  copy automatically.
- **C3** Calendar sync: viewings and meetings onto the timeline.

Each is an OAuth integration plus a dependency.

### Phase D — agents

- **D1** Custom agents: admin-defined trigger + prompt + output, on the
  existing BYOK layer.
- **D2** Meeting-prep brief from a client's timeline.
- **D3** Email drafting from deal context.
- **D4** Document extraction — pull sale price and dates out of an uploaded
  contract PDF. Feeds A3.

### Phase E — automations

Field-change triggers ("when stage becomes Contract"), recurring schedules,
more actions (send email, assign owner, update a field), and a recipe library
so an admin picks a template rather than composing from scratch.

### 3.1 Dependency approvals these need

| Need | Package | Phase |
|---|---|---|
| Parse `.xlsx` / `.csv` | `xlsx` or `papaparse` | A3 |
| Send email | Resend / Postmark / SES SDK | C1, §2.3 |
| E-signature | DocuSign SDK | C2 |
| Charts | a charting library | B4 |

All are stack additions. CLAUDE.md requires explicit approval for each.

---

## 4. MONDAY WORKSPACE — observed structure

Recorded from screenshots supplied 2026-07-29 of
`themisnik7s-team.monday.com`, workspace **CRM**. The URL itself is not
fetchable (board data loads client-side after authentication), so this is the
authoritative record of what was seen.

⚠️ **The sample data is monday's CRM template, not this business's records.**
Deals are "Google deal / Apple deal / Amazon deal"; leads are at Wix and
Microsoft; contacts are Steven Scott, Sam Jones, Robert Thompson. Nothing
property-related appears anywhere. So these screenshots evidence **the
structure Themis wants to work in**, not a configured Golden Visa process.
Treat board *shapes* as the requirement and board *contents* as placeholder.

### 4.1 Boards in the CRM workspace

| Board | Views | Automations | Notable columns |
|---|---|---|---|
| Workspace home | — | — | — |
| **Contacts** | — | — | — |
| **Deals** | Main table, Sales report, **Pipeline** | 8 | Stage (status), Owner, Deal Value, **Contacts (connected board)**, **Activities timeline**, subitems |
| **Leads** | Main table, **Lead submission form** | 6 | Status, Owner, Activities timeline, **"Move to Contacts" button**, Company, Title |
| **Accounts** | — | — | — |
| **Client Projects** | Main table, **Gantt** | 1 | Priority, **Timeline (date range)**, Status, **Deals (connected)**, **Contact (connected)**, subitems |
| **Products & Services** | — | — | — |
| **Activities** | Main table | 1 | Owner, **Activity Type** (Call summary / Meeting), **Start time**, **End time**, Status (Done) |
| **Sales Dashboard** | — | — | — |

Boards carrying an **Import** button: Deals, Leads. Gmail is connected via
**Integrate** on Deals, Leads, Activities, Client Projects.

### 4.2 Product areas outside the boards

- **Sidekick** — conversational AI assistant with its own chat history,
  **Memory**, **Personalization**, and **skills**. Quick actions: Build a
  sequence, Work my deals, Log a meeting, Explore my pipeline, Create a doc,
  Create a board, Analyze data. Suggested prompts are deal-centric
  ("Re-engage stalled deals with a sequence", "Find deals stuck in
  Negotiation", "Draft a follow-up for a quiet deal", "Bulk close stale
  deals").
- **Agents** — a gallery of prebuilt "Revenue Experts": **Pipeline monitor**,
  **Meeting prep**, **Lead sourcer**, **Outreach caller**, plus New agent.
- **Tools** — **Sequences** (multi-step email cadences, in beta),
  **Quotes and Invoices**, **Mass email tracking**.
- **Notetaker** — its own top-level item in the left rail.

### 4.3 Structural gaps this reveals in NewLife GPI

Things the screenshots show that the earlier plan (§3, written from public
docs) got wrong or missed entirely:

1. **Leads and Contacts are separate boards**, joined by an explicit
   "Move to Contacts" button. NewLife GPI collapsed both into one `Contact`
   model with no lead stage, no `Company`/`Title`, and no conversion step.
2. **Accounts is a distinct board** — a company layer above contacts.
   NewLife GPI has no organisation entity at all.
3. **Subitems** exist on Deals and Client Projects. NewLife GPI has no
   subitem concept on any record.
4. **Connected-board columns** are used heavily (Deals→Contacts,
   Client Projects→Deals and →Contact). NewLife GPI has foreign keys but no
   generic linked-record UI.
5. **"Activities timeline" column** renders a per-row strip of recent
   activity inline in the table — a distinctive monday element with no
   equivalent here.
6. **Lead submission form** is a public form view that creates records.
   NewLife GPI has no form capability.
7. **Activities carry Start time AND End time** plus an Activity Type
   vocabulary including "Call summary". NewLife GPI's `Activity` has a single
   `occurredAt` and no duration.
8. **Products & Services** is its own board — likely where a property
   catalogue would live in a monday-shaped model.
9. **Sequences, Quotes & Invoices, Mass email tracking** are whole product
   areas with no counterpart here.
10. **Sidekick is conversational and has memory**; NewLife GPI's AI is a
    one-shot "Analyse" button with no chat, no history, no memory.

### 4.4 Decisions taken 2026-07-29

Answers from Themis after reviewing the screenshots above.

**D1 — Shape: map monday's mechanics onto the property domain.** Property /
Ownership / Payments / Visa / Rental stays the spine, because it encodes
Golden Visa process that monday's generic CRM knows nothing about. The
missing monday *mechanics* (lead funnel, accounts, subitems, linked records,
activity strips, board views) get added around it. Not a literal rebuild of
monday's board set.

**D2 — ⚠️ THE REAL FUNNEL, AND THE SHIPPED STAGES ARE WRONG.** Themis:

> "leads are the people we are in contact, to buy a property. so the
> conversion is: lead → zoom meeting → athens visit → power of attorney →
> buyer"

That is a five-step acquisition funnel specific to this business. The stages
shipped in `src/lib/pipeline.ts` — `NEW_LEAD / QUALIFIED / VIEWING / OFFER /
RESERVATION / CONTRACT / WON / LOST` — were taken from a generic B2B sales
template and **describe a process this business does not run.** They must be
replaced. Consequences:

- `DEAL_STAGES` in `src/lib/pipeline.ts` is rewritten, and with it the
  probabilities behind the weighted forecast.
- The `deals.stage` check constraint in `0013_pipeline.sql` needs a follow-up
  migration; existing demo rows must be remapped, not silently left invalid.
- "Buyer" is not merely a won deal — it is the point where a Contact becomes
  a real client: Clerk account linked, `PropertyOwnership` created. The
  existing conversion machinery (`linkContactToClerkUser`) is the right hook.
- "Power of attorney" is a **document**, not just a status. It is the
  strongest argument yet for per-stage document slots, and the mechanism
  already exists — `RentalStageRecord`'s `slot` design does exactly this.

**D3 — Accounts are needed.** Buyers come through companies and introducers,
so an Account/Organisation layer is in scope. Contacts and Deals hang off it,
enabling "revenue by introducer" reporting.

**D4 — Tools deferred.** Quotes & Invoices, Sequences, Mass email tracking
and Notetaker are all **out of scope for now** ("none for now"). Do not build
them, and do not add the email or transcription dependencies they would
require.

### 4.5 Still needed to go further

A **board export to Excel** (Board menu → Export board to Excel) for Deals,
Leads, and Contacts would give exact column types and the real option sets
behind each status column — and would double as the test fixture for the
importer in A3. Screenshots settle structure; they do not settle column
configuration.
