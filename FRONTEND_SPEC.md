# FRONTEND_SPEC.md — Component Map (from Claude Design ingestion)

**Source:** `NewLife GPI Design System` (claude.ai/design, projectId `60b43d72-00ee-4e06-bef3-4fee2e010ecc`), last updated 2026-07-16.
**Method:** Pulled via `DesignSync` (`list_projects` → `list_files` → `get_file`) on 2026-07-18. Every component/prop/field below was read directly from the project's `.jsx`/`.d.ts` files — nothing here is inferred or guessed.

## ⚠️ Discrepancy flag — read before building

The design pulled from the canvas is **not** the internal ops CRM implied by the task's example components. `ui_kits/dashboard/README.md` (verbatim) describes it as:

> "Interactive recreation of the **after-sales CRM dashboard for Golden Visa clients**... From-scratch design (no source codebase/Figma was provided)."

This is a **client-facing portal for a single logged-in property buyer** (login → sidebar → Overview / Construction / Golden Visa / Payments / Rental / Personal info). It does **not** contain:
- A `Sidebar` component as a standalone file — the sidebar is inlined inside `Shell.jsx`.
- Any `ClientRow` component — there is no multi-client list/table screen anywhere in this design. Every screen is scoped to one client (`client.name`, `client.property`) already logged in.
- Any `ApiKeyForm` component — there is no BYOK / API-key management screen in this design, despite that being a core piece of `ARCHITECTURE.md`'s data model (`encrypted_api_keys`).

**Recommendation:** proceed with mapping the design exactly as pulled (below). If you need a multi-client admin list view or an API-key management screen (both described in `ARCHITECTURE.md`), those must be designed separately — they don't exist in this design-system project yet. Let me know if you want me to draft those as new screens before we ingest further.

---

## 1. Atomic Component Library (`components/`)

These are the true reusable, presentational primitives already defined in the design system. Props are copied directly from each component's `.d.ts`.

### Core (`components/core/`)

| Component | Key props | Notes |
|---|---|---|
| `Button` | `variant` (primary\|secondary\|outline\|ghost\|danger), `size` (sm\|md\|lg), `disabled`, `fullWidth`, `icon`, `onClick`, `type` | |
| `IconButton` | `icon`, `label` (a11y), `variant` (ghost\|outline\|filled), `size`, `active`, `disabled`, `onClick` | Used for sidebar log-out control |
| `Badge` | `children`, `tone` (neutral\|primary\|success\|warning\|danger\|accent), `dot` | Status pills throughout |
| `Tag` | `children`, `selected`, `onRemove` | Present in library; **not used in any current screen** |

### Forms (`components/forms/`)

| Component | Key props | Notes |
|---|---|---|
| `Input` | `label`, `placeholder`, `value`, `onChange`, `type` (text\|email\|password\|number\|tel\|date), `helpText`, `error`, `disabled`, `prefix`, `suffix` | |
| `Checkbox` | `label`, `checked`, `onChange`, `disabled`, `helpText` | |
| `Switch` | `label`, `checked`, `onChange`, `disabled` | |
| `Select` | `label`, `options[{label,value}]`, `value`, `onChange`, `placeholder`, `helpText`, `disabled` | Present in library; **not used in any current screen** |
| `Radio` | `label`, `checked`, `onChange`, `name`, `disabled` | Present in library; **not used in any current screen** |

### Feedback (`components/feedback/`)

| Component | Key props | Notes |
|---|---|---|
| `Card` | `children`, `padding` (sm\|md\|lg), `hoverable` | Primary content container everywhere |
| `ProgressBar` | `value` (0–100), `tone` (primary\|success\|warning\|danger), `label`, `showValue`, `size` (sm\|md) | |
| `Dialog` | `open`, `title`, `children`, `onClose`, `footer` | Present in library; **not used in any current screen** |
| `Toast` | `tone` (info\|success\|warning\|danger), `title`, `description`, `onDismiss` | Present in library; **not used in any current screen** |
| `Tooltip` | `children`, `label`, `side` (top\|bottom\|right) | Present in library; **not used in any current screen** |

### Navigation (`components/navigation/`)

| Component | Key props | Notes |
|---|---|---|
| `NavItem` | `icon`, `label`, `active`, `onClick`, `badge` | Sidebar nav row |
| `StatCard` | `label`, `value`, `delta`, `icon`, `tone` (neutral\|success\|danger) | Dashboard KPI tile |
| `Tabs` | `tabs[{label,value}]`, `active`, `onChange` | Sub-navigation within a screen |

---

## 2. Composed Screens & Required Mock Data

Each screen below is a composition of the atomic components above, plus **inline row/list patterns** that are not yet extracted into their own component files in the design system (rendered via `.map()` inside the page). If you want reusable atomic components for the Next.js build, these are the ones to extract.

### `Shell` — App frame (sidebar + logged-in wrapper)
Composed of: `NavItem` ×6, `IconButton` (log out)
- **Mock data needed:**
  - `client.initials` (string, e.g. `"MP"`)
  - `client.name` (string, e.g. `"Maria Papadopoulos"`)
  - `client.property` (string, e.g. `"Villa Elytra"`)
  - Static nav list: `{ key, label, icon }` × 6 (`overview`, `construction`, `visa`, `payments`, `rental`, `profile`) — hardcoded in `Shell.jsx`, not client-specific

### `Login` — Split-screen sign-in
Composed of: `Input` ×2, `Button`
- **Mock data needed:** none (form is uncontrolled/blank on load); static marketing copy is hardcoded

### `Overview` — Dashboard home
Composed of: `StatCard` ×4, `Card` ×3, `Badge`, `ProgressBar` ×2, `Button` ×2
- **New presentational component to extract:** `ActivityItem` (icon + text + relative time row)
- **Mock data needed:**
  - `client.firstName`, `client.property`
  - 4× stat tiles: `{ label, value, delta, tone }` (construction %, visa stage, next payment amount + due date, ENFIA amount + status)
  - Property card: name/location string, status badge tone+label, progress %, freeform update text
  - Visa card: progress %, freeform status text
  - Activity feed: array of `{ icon, text, time }` (4 rows in current mock)

### `Construction` — Milestone tracker
Composed of: `Card`, `ProgressBar` (overall + per-milestone), `Badge`, `Tabs`
- **New presentational components to extract:** `MilestoneRow` (label + progress bar + status badge), `UpdateCard` (photo placeholder + title + date + description), `DocumentRow` (file icon + name + download icon)
- **Mock data needed:**
  - Overall progress % + label
  - Milestones: array of `{ label, pct, status }` (5 rows)
  - Photo/video updates: array of `{ title, date, desc }` (3 in mock; no real image — thumbnail is an icon placeholder)
  - Site documents: array of filename strings (3 in mock)

### `GoldenVisa` — 5-step application timeline
Composed of: `Card`, `Badge`, `Button`
- **New presentational components to extract:** `TimelineStep` (numbered/checked circle + connector line + title + date badge + optional description), `DocumentChecklistRow` (icon + name + optional upload button)
- **Mock data needed:**
  - Steps: array of `{ title, status: done|current|upcoming, date, desc? }` (5 steps)
  - Documents on file: array of `{ name, done: boolean }` (4 in mock)

### `Payments` — Payment plan + expenses calculator
Composed of: `Card`, `Tabs`, `ProgressBar`, `Badge`, `Input`, `Checkbox`, `Button`
- **New presentational component to extract:** `InstallmentRow` (status icon + label + date + amount + status badge)
- **Mock data needed:**
  - Property total price (string, e.g. `"€280,000"`)
  - Paid-to-date %
  - Installments: array of `{ label, amount, date, status: Paid|Due|Upcoming }` (7 rows in mock)
  - Calculator inputs: `price` (numeric string), `legal` (boolean), `furnish` (boolean) — derived breakdown lines are computed client-side, not mock data (transfer tax 3%, notary ~1.2%, legal 1%, furnishing flat €12,000)

### `Rental` — Managed rental income + taxes
Composed of: `Card`, `Tabs`, `Badge`, `Switch`
- **New presentational components to extract:** `RentalPayoutRow` (month + nights booked + amount + status badge), `TaxObligationRow` (icon + label + due date + amount + status badge)
- **Mock data needed:**
  - Enrollment switch state (boolean)
  - Rental income: array of `{ month, amount, nights, status }` (3 rows in mock)
  - Auto-pay switch state (boolean)
  - Tax obligations: array of `{ label, amount, due, status: Paid|Due|Not yet due }` (3 rows in mock)

### `PersonalInfo` — Contact + tax identity + documents
Composed of: `Card`, `Input`, `Button`, `Tabs`, `Badge`
- **New presentational component to extract:** `DocumentVerificationRow` (icon + name + status badge + "View" button)
- **Mock data needed:**
  - Contact fields: full name, email, phone (strings)
  - Tax identity fields: AFM/tax ID, Taxisnet username, Taxisnet password (masked)
  - Documents: array of `{ name, status: Verified|Expiring soon }` (4 rows in mock)

---

## 3. Summary Component Count

- **Atomic/reusable (already in design system):** 14 — `Button`, `IconButton`, `Badge`, `Tag`, `Input`, `Checkbox`, `Switch`, `Select`, `Radio`, `Card`, `ProgressBar`, `Dialog`, `Toast`, `Tooltip`, `NavItem`, `StatCard`, `Tabs` *(17 total counting Tag/Select/Radio/Dialog/Toast/Tooltip, which are unused in current screens)*
- **New row/item components to extract from inline `.map()` patterns:** 9 — `ActivityItem`, `MilestoneRow`, `UpdateCard`, `DocumentRow`, `TimelineStep`, `DocumentChecklistRow`, `InstallmentRow`, `RentalPayoutRow`, `TaxObligationRow`, `DocumentVerificationRow` *(10, listing separately per screen since row shapes differ)*
- **Page-level screens:** 8 — `Shell`, `Login`, `Overview`, `Construction`, `GoldenVisa`, `Payments`, `Rental`, `PersonalInfo`

No Next.js page code has been generated. This file is for component-map inspection only.
