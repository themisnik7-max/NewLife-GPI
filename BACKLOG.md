# BACKLOG.md — Outstanding work and open decisions

Everything identified but **not yet done**, as of 2026-07-29. This is the
companion to LOGS.md: that file records what happened, this one records what
has not happened yet and why.

Written after the six-phase CRM expansion landed on branch
`feat/crm-platform-expansion` (commit `fd6cab2`). Items are grouped by whether
they **block use of what already exists** or **extend it**.

---

## 0. BLOCKERS — nothing new works until these are done

### 0.1 Migrations 0010–0014 are not applied

`prisma/schema.prisma` and the generated client are ahead of the live database.
Five migrations exist in `supabase/migrations/` and have **never been run**:

| File | Creates |
|---|---|
| `0010_documents.sql` | `documents` |
| `0011_activities.sql` | `activities` |
| `0012_saved_views.sql` | `saved_views` |
| `0013_pipeline.sql` | `contacts`, `deals` |
| `0014_automation_rules.sql` | `automation_rules` |

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

## 4. MONDAY BOARD MAPPING — blocked on access

The plan in §3 is derived from **monday's public product and support
documentation**, not from this business's actual monday workspace.

Board `5101203939` at `themisnik7s-team.monday.com` was supplied on
2026-07-29. It is **not readable** without authentication: fetching the URL
returns monday's marketing shell, because board data loads client-side after
login.

To map the plan onto the real board rather than the generic product, one of:

1. **Board export** (Board menu → Export board to Excel) committed to the repo
   or shared. Best option — it also becomes the fixture for A3's importer.
2. **A monday API token** (Admin → API → personal API token), which allows
   querying `api.monday.com/v2` for the real column types, groups, and
   automations. Note this is a live credential with workspace-wide read access.
3. **Screenshots** of the board, its view tabs, and its automation list.

Until then, §3's phases are informed guesses about which monday capabilities
matter to this business, not a mapping of the ones it actually uses.
