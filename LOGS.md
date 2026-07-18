# LOGS.md — Development Timeline Ledger

This file is the running trajectory history of the project: initialization, feature additions, bug fixes, and manual review completions. Append new entries chronologically; do not rewrite or delete past entries.

## Entry Schema

Each entry should follow this template:

```
### [YYYY-MM-DD] <Type>: <Short Title>

- **Type:** Init | Feature | Bugfix | Review
- **Summary:** One or two sentences describing what changed.
- **Files touched:** (optional, for larger changes)
- **Status:** Completed | In Progress | Blocked
```

---

## 2026-07-18 — Init: Project Infrastructure Bootstrapped

- **Type:** Init
- **Summary:** Initialized project management scaffolding by creating `CLAUDE.md` (behavioral contract), `ARCHITECTURE.md` (structural blueprint), and `LOGS.md` (this file) in the project root. No application code has been written yet.
- **Files touched:** `CLAUDE.md`, `ARCHITECTURE.md`, `LOGS.md`
- **Status:** Completed

---

## 2026-07-18 — Feature: Claude Design Ingestion → FRONTEND_SPEC.md

- **Type:** Feature
- **Summary:** Pulled the "NewLife GPI Design System" project from claude.ai/design via `DesignSync` (list_projects → list_files → get_file) and mapped its full component inventory into `FRONTEND_SPEC.md`: 17 atomic components (core/forms/feedback/navigation), 8 composed screens (Shell, Login, Overview, Construction, GoldenVisa, Payments, Rental, PersonalInfo), and 9 new row-level presentational components to extract from inline list-rendering patterns, each with their required mock data fields. Flagged a scope discrepancy: the pulled design is a single-client Golden Visa property portal, not a multi-client admin CRM — it has no `Sidebar` as a standalone component, no client-list/`ClientRow` screen, and no BYOK/`ApiKeyForm` screen (the latter is expected per `ARCHITECTURE.md`'s `encrypted_api_keys` model but does not yet exist in the design). No Next.js code generated.
- **Files touched:** `FRONTEND_SPEC.md` (created), `LOGS.md`
- **Status:** Completed — pending user decision on how to handle the missing multi-client/API-key screens

---

## 2026-07-19 — Feature: Modular UI Components (Sidebar, TopNav, ClientTable, ApiKeyCard) + Test-Driven Verification

- **Type:** Feature
- **Summary:** Scaffolded the Next.js/TypeScript/Tailwind/Vitest project (no scaffold existed yet — this was the first application code in the repo), built four isolated presentational components per `FRONTEND_SPEC.md` and `ARCHITECTURE.md`, wrote a Vitest + React Testing Library unit test for each, drove the suite to 100% green, verified with a strict `tsc --noEmit` type-check and a full `next build`, and composed the components into `src/app/dashboard/page.tsx` and `src/app/settings/page.tsx`.

### Project scaffold created (no application code existed prior to this entry)
- `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `src/__tests__/setup.ts`, `src/app/layout.tsx`, `src/app/globals.css`
- Design tokens (colors, typography, radius, shadow) copied verbatim into `tailwind.config.ts` / `globals.css` from the real "NewLife GPI Design System" claude.ai/design project (`tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`) — not invented placeholder values.
- Dependencies: `next@14.2.35`, `react@18.3.1`, `react-dom@18.3.1`, `lucide-react@0.427.0` (icon set matches the icon names specified in the source `Shell.jsx`), plus Vitest/RTL/Tailwind devDependencies.
- **Security fix during install:** `npm audit` flagged `next@14.2.5` (the initially-scaffolded version) for multiple critical/high CVEs (cache poisoning, SSRF, auth bypass, XSS). Bumped to `next@14.2.35`, which resolves the critical-severity advisories while staying within the "Next.js 14+" stack requirement. Residual **high**-severity advisories and a moderate `esbuild`/`vite` (dev-server-only) advisory remain unresolved because fixing them requires breaking major-version jumps (Next 16, Vitest 4) outside this task's scope — flagged to the user, not applied unilaterally.

### Components created (`src/components/ui/`)
| File | Lines | Notes |
|---|---|---|
| `Sidebar.tsx` | 97 | `"use client"`. Nav items and structure mirror the source design's `Shell.jsx` sidebar exactly (6 nav keys, client identity footer, log-out control). |
| `TopNav.tsx` | 73 | `"use client"`. **Net-new** — no top bar exists in the pulled design (which is sidebar-only); built to satisfy this task's layout-container requirement using the same tokens. |
| `ClientTable.tsx` | 118 | `"use client"`. **Net-new** — no multi-client list screen exists in the pulled design (flagged in the prior `FRONTEND_SPEC.md` entry); built from the `clients` table shape in `ARCHITECTURE.md`. Ships with 5 hardcoded mock rows (`MOCK_CLIENTS`), exported for test reuse. |
| `ApiKeyCard.tsx` | 118 | `"use client"`. **Net-new** — no BYOK screen exists in the pulled design; built from the `encrypted_api_keys` shape in `ARCHITECTURE.md`. Key is always rendered pre-masked (`sk-ant-••••••••••••wq7A`); no full-secret reveal affordance was added, since `ARCHITECTURE.md` requires decryption to stay server-side only. |

All four hold local UI state only (`useState` for nav active-state is prop-driven, search input value, copy-confirmation flag) — no database or network calls, per instruction.

### Tests created (`src/__tests__/components/`) — 18 tests, 4 files
| File | Lines | Tests |
|---|---|---|
| `Sidebar.test.tsx` | 48 | 4 — brand/client identity render, all 6 nav buttons visible, active-state + `onNavigate` call, `onLogout` call |
| `TopNav.test.tsx` | 49 | 4 — title/subtitle/user render, search input visible + editable, notification badge count, badge omitted at zero |
| `ClientTable.test.tsx` | 61 | 4 — all mock fields render per row, one "View" button per row, `onViewClient` called with correct id, custom `clients` prop overrides mock |
| `ApiKeyCard.test.tsx` | 74 | 6 — mock fields render, no raw secret ever rendered, Rotate/Revoke visible+enabled, callbacks fire with key id, clipboard copy, disabled+"Revoked" state |

### Test execution — two real failures found and fixed, then 100% green
1. **First `npm run test` run:** `ClientTable.test.tsx` failed — `getByText("Active")` matched 2 elements because two mock clients intentionally share the "Active" status. **Test bug, not component bug.** Fixed by scoping each assertion to its own `<tr>` via `within()`.
2. **Second run:** `ApiKeyCard.test.tsx` failed twice — (a) a loose `/Anthropic/` regex matched both the key label and the provider line; fixed with an exact-string match. (b) `user-event`'s `setup()` installs its own clipboard polyfill that silently overwrote the `vi.fn()` clipboard mock, so the assertion saw a real `AsyncFunction` instead of a spy; fixed by using `fireEvent.click` for that one interaction instead of `user-event`.
3. **Third run — 100% pass:** `Test Files 4 passed (4)`, `Tests 18 passed (18)`. Verbatim result:
   ```
   ✓ src/__tests__/components/ClientTable.test.tsx (4 tests) 412ms
   ✓ src/__tests__/components/ApiKeyCard.test.tsx (6 tests) 467ms
   ✓ src/__tests__/components/TopNav.test.tsx (4 tests) 492ms
   ✓ src/__tests__/components/Sidebar.test.tsx (4 tests) 519ms
   Test Files  4 passed (4)
        Tests  18 passed (18)
   ```

### Additional verification beyond the instructed test run
- `npx tsc --noEmit` — clean, no output, confirms strict-mode TypeScript compiles with zero errors across the whole project.
- `npm run build` — **first attempt failed**: `ClientTable.tsx` was missing its `"use client"` directive despite containing an `onClick` handler, so Next.js tried to ship a Server Component with an event handler, throwing "Event handlers cannot be passed to Client Component props" during static generation of `/dashboard`. Fixed by adding `"use client"` to the top of `ClientTable.tsx`. Re-ran the full Vitest suite (still 18/18 green) and a clean `next build`, which succeeded: both `/dashboard` (3.58 kB) and `/settings` (3.83 kB) statically prerendered successfully.

### Pages composed (`src/app/`)
| File | Lines | Composition |
|---|---|---|
| `dashboard/page.tsx` | 29 | `Sidebar` (`activeKey="overview"`) + `TopNav` (title "Clients") + `ClientTable` |
| `settings/page.tsx` | 28 | `Sidebar` (`activeKey="profile"`) + `TopNav` (title "Settings") + `ApiKeyCard` |

**Known gap, carried over from the prior `FRONTEND_SPEC.md` entry:** `Sidebar`'s nav vocabulary (Overview/Construction/Golden Visa/Payments & expenses/Rental & taxes/Personal info) is inherited from the single-client portal design and has no literal "Clients" or "Settings" entry — `activeKey` values above are the closest conceptual match, not an exact fit. A real admin nav for these two screens doesn't exist yet in the source design.

**Design-fidelity note:** the pulled design tokens define a light-only theme (`stone-25` background, `stone-900` text; shadows explicitly documented as "soft & diffuse... never harsh/dark"). This contradicts the parent config's generic "Dark-mode priority" standard. Followed the actual approved design (light theme) rather than force an unspecified dark variant — flagged for a decision if dark mode is still wanted.

### Lines of code added this session
406 (components) + 232 (tests) + 57 (pages) + 184 (project scaffold/config) = **879 lines** across 19 files.

- **Files touched:** `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `src/__tests__/setup.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/dashboard/page.tsx`, `src/app/settings/page.tsx`, `src/components/ui/Sidebar.tsx`, `src/components/ui/TopNav.tsx`, `src/components/ui/ClientTable.tsx`, `src/components/ui/ApiKeyCard.tsx`, `src/__tests__/components/Sidebar.test.tsx`, `src/__tests__/components/TopNav.test.tsx`, `src/__tests__/components/ClientTable.test.tsx`, `src/__tests__/components/ApiKeyCard.test.tsx`, `LOGS.md`
- **Status:** Completed — pending user decision on (1) the missing admin nav vocabulary for Clients/Settings, (2) whether to pursue the Next 16 / Vitest 4 major upgrades to clear the remaining audit advisories, and (3) whether dark mode should be added despite the source design being light-only.

---

## 2026-07-19 — Feature: Root Route Redirect — Frontend Prototyping Phase Complete

- **Type:** Feature
- **Summary:** Created `src/app/page.tsx`, a lightweight Server Component that calls `redirect("/dashboard")` from `next/navigation` so requests to `/` no longer 404. Ran the full Vitest suite to confirm no regressions (still 18/18 green, 4/4 test files), then verified the fix live against the running dev server with a direct HTTP request rather than relying on tests alone: `curl` against `http://localhost:3000/` returned `HTTP/1.1 307 Temporary Redirect` with `Location: /dashboard`. No dedicated unit test was written for this file, consistent with the precedent set for `dashboard/page.tsx` / `settings/page.tsx` — page-level composition/routing files aren't unit-tested individually in this project; the presentational components they render are (see prior entry). This closes out the Frontend Prototyping Phase: routing, layout, and the four core presentational components are all in place and verified.

**Root redirect resolution:**
- `src/app/page.tsx` — new file, 5 lines, Server Component (no `"use client"` needed — `redirect()` issues the 307 during SSR before any client JS ships).

**Operational local environment at time of this entry:**
- Dev server running via `npm run dev` — **background task id `b1z3tlw2w`** — `http://localhost:3000`, Next.js 14.2.35, started cleanly in 4.3s.
- **Two operational page routes:**
  - `/dashboard` — `Sidebar` + `TopNav` + `ClientTable`
  - `/settings` — `Sidebar` + `TopNav` + `ApiKeyCard`
- `/` now resolves via 307 redirect to `/dashboard` instead of 404ing.

- **Files touched:** `src/app/page.tsx` (created), `LOGS.md`
- **Status:** Completed — Frontend Prototyping Phase closed. Open items carried forward from the prior two entries remain outstanding: admin nav vocabulary for Clients/Settings, the Next 16/Vitest 4 upgrade decision, the dark-mode decision, and the still-missing multi-client/API-key screens in the source Claude Design project itself.

---

### [PRE-AUTH SANITY CHECK] — 2026-07-19

- **Type:** Review
- **Summary:** Ran a full lint → build → test sanity pass before moving into the authentication phase. One setup gap was found and fixed (no ESLint config existed yet); all three checks are green as of this entry.

**1. `npm run lint`**
- First run failed (exit 1) — no ESLint config existed in the repo yet, so `next lint` tried to launch its interactive setup wizard (`? How would you like to configure ESLint?`), which can't run in a non-interactive shell.
- Fixed by adding `eslint@8.57.0` and `eslint-config-next@14.2.35` as devDependencies and creating `.eslintrc.json` with `{"extends": "next/core-web-vitals"}` — the same config the wizard's "Strict (recommended)" option would have generated.
- Re-ran after installing: `✔ No ESLint warnings or errors`. Nothing required auto-fixing.
- **New audit finding from this install:** `eslint-config-next@14.2.35` pulls in a `glob` version with a high-severity command-injection advisory (GHSA-5j98-mcp5-4vw2, in the `glob` CLI's `-c/--cmd` flag). `@next/eslint-plugin-next` only consumes `glob` as a library call, never the CLI, so the exploitable surface (the CLI flag) isn't reachable through this dependency chain, and it's a devDependency (lint-time only, never shipped). The only fix is `eslint-config-next@16.2.10`, which requires the same Next 16 major-version jump already flagged as an open decision in the 2026-07-19 "Modular UI Components" entry — folded into that same pending decision rather than treated as new.

**2. `npm run build`**
- Ran a clean build (`rm -rf .next` first). Result:
  ```
  ✓ Compiled successfully
  Linting and checking validity of types ...
  ✓ Generating static pages (6/6)

  Route (app)                              Size     First Load JS
  ┌ ○ /                                    138 B          87.4 kB
  ├ ○ /_not-found                          873 B          88.1 kB
  ├ ○ /dashboard                           3.58 kB        90.8 kB
  └ ○ /settings                            3.83 kB        91.1 kB
  + First Load JS shared by all            87.2 kB
  ```
- All 4 routes (including the new `/` redirect) compiled and prerendered with no TypeScript or import errors.

**3. `npm run test`**
- ```
  ✓ src/__tests__/components/ClientTable.test.tsx (4 tests) 263ms
  ✓ src/__tests__/components/ApiKeyCard.test.tsx (6 tests) 327ms
  ✓ src/__tests__/components/Sidebar.test.tsx (4 tests) 350ms
  ✓ src/__tests__/components/TopNav.test.tsx (4 tests) 423ms

  Test Files  4 passed (4)
       Tests  18 passed (18)
  ```
- **Correction (superseded by the `[COVERAGE BASELINE]` entry below):** this was a 100% *pass rate* (18/18 existing tests green) — not a code-coverage percentage. At the time of this entry, no coverage tool was installed or configured in this project, so no statement/branch/line coverage number had ever actually been measured. `@vitest/coverage-v8` was installed shortly after; see the entry below for real, measured coverage figures.

- **Files touched:** `package.json`, `.eslintrc.json` (created), `LOGS.md`
- **Status:** Completed — lint, build, and test all pass. Codebase is structurally sound to proceed into the authentication phase. Carried-forward open decisions (Next 16 / Vitest 4 upgrade — now also covering the `eslint-config-next` glob advisory, admin nav vocabulary, dark mode, missing admin screens in the source design) are unchanged from prior entries.

---

### [COVERAGE BASELINE] — 2026-07-19

- **Type:** Feature
- **Summary:** Installed `@vitest/coverage-v8` and wired a `test.coverage` block into `vitest.config.ts` (provider `v8`, reporters `text`/`json`/`html`, exclude list scoped to `node_modules/**`, `.next/**`, `vitest.config.ts`, `postcss.config.js`, `tailwind.config.ts`, `src/__tests__/**`). Added `"test:coverage": "vitest run --coverage"`. Ran it — 18/18 tests still pass, and this is the first entry in the project with an actual measured coverage percentage rather than a pass-rate stand-in.

**Setup note:** installing `@vitest/coverage-v8` surfaced 2 **critical** advisories directly against `vitest` itself (GHSA: RCE via a malicious website when the Vitest API server is listening; arbitrary file read/execute when the Vitest UI server is listening) that weren't visible as their own top-level `npm audit` entry before. Verified via `npm ls vitest` that this is the *same* deduplicated `vitest@2.0.5` already in the tree since the original scaffold — no new/different vulnerable version was introduced. The advisories were always present in this pinned version; they only became their own top-level audit node because `@vitest/coverage-v8` gives the package a second reference path, which is how `npm audit`'s report grouping works. Real-world exposure is narrow: both require the Vitest **API** or **UI** server to be actively listening (`vitest --api` / `vitest --ui`), and neither `test` nor `test:coverage` in this project ever starts those (`vitest run` executes once and exits). Dev-only dependency either way — never shipped into the Next.js production bundle. Full remediation requires the same Vitest 4 major upgrade already tracked as an open decision; folded in here rather than raised as a new one, but the severity is now confirmed critical rather than assumed-low, so it should be weighted accordingly when that decision gets made.

**Result — framework pollution was only partially isolated by the exact exclude list specified:**
```
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   80.17 |    79.41 |   68.75 |   80.17 |
 NewLifeGPI        |       0 |       50 |      50 |       0 |
  next-env.d.ts    |       0 |        0 |       0 |       0 |
  next.config.js   |       0 |        0 |       0 |       0 | 1-4
 src/app           |       0 |        0 |       0 |       0 |
  layout.tsx       |       0 |        0 |       0 |       0 | 1-19
  page.tsx         |       0 |        0 |       0 |       0 | 1-5
 src/app/dashboard |       0 |        0 |       0 |       0 |
  page.tsx         |       0 |        0 |       0 |       0 | 1-29
 src/app/settings  |       0 |        0 |       0 |       0 |
  page.tsx         |       0 |        0 |       0 |       0 | 1-28
 src/components/ui |     100 |    92.85 |     100 |     100 |
  ApiKeyCard.tsx   |     100 |     90.9 |     100 |     100 | 94
  ClientTable.tsx  |     100 |      100 |     100 |     100 |
  Sidebar.tsx      |     100 |      100 |     100 |     100 |
  TopNav.tsx       |     100 |    85.71 |     100 |     100 | 59
-------------------|---------|----------|---------|---------|-------------------
```
The exact exclude array requested doesn't cover `next.config.js`, `next-env.d.ts` (an auto-generated, zero-logic ambient-types file), or `src/app/**` (the root/dashboard/settings pages, which — per established precedent in this project — are routing/composition files that intentionally have no dedicated unit tests). Those un-excluded, untested framework/page files are what drags the `All files` aggregate down to 80.17%/79.41%/68.75%/80.17%, which understates the real picture and doesn't fully satisfy the stated goal of isolating business logic from framework artifacts.

> **Closed the same day** — see `[COVERAGE EXCLUSIONS REFINED]` below: the recommended follow-up (adding `next.config.js`, `next-env.d.ts`, `src/app/**` to the exclude array) was applied, and `All files` now matches `src/components/ui` exactly.

**The actual business-logic baseline — `src/components/ui/**` (the four tested presentational components):**

| Metric | % |
|---|---|
| Statements | 100 |
| Branch | 92.85 |
| Functions | 100 |
| Lines | 100 |

Two untested branches remain, both minor: `ApiKeyCard.tsx` line 94 (the `disabled` conditional path on the Rotate/Revoke buttons isn't exercised in a way that hits every branch permutation) and `TopNav.tsx` line 59 (the `notificationCount > 9` "9+" overflow branch has no test case).

- **Files touched:** `package.json`, `vitest.config.ts`, `LOGS.md`
- **Status:** Completed as literally specified. **Open follow-up recommended, not yet applied:** extend the coverage `exclude` array to also cover `next.config.js`, `next-env.d.ts`, and `src/app/**`, so the `All files` aggregate reflects actual business logic rather than untested framework scaffolding. Also carried forward: the Next 16 / Vitest 4 upgrade decision (now weighted higher given the confirmed-critical vitest advisories), admin nav vocabulary, dark mode, and missing admin screens in the source design.

---

### [COVERAGE EXCLUSIONS REFINED] — 2026-07-19

- **Type:** Feature
- **Summary:** Closed the follow-up flagged in `[COVERAGE BASELINE]` above. Extended `test.coverage.exclude` in `vitest.config.ts` to also omit `next.config.js`, `next-env.d.ts`, and `src/app/**`, on top of the original `node_modules/**`, `.next/**`, `vitest.config.ts`, `postcss.config.js`, `tailwind.config.ts`, `src/__tests__/**`. Re-ran `npm run test:coverage`: 18/18 tests still pass, and the `All files` aggregate now exactly matches `src/components/ui` — framework/config boilerplate is fully isolated out of the metric.

**Final `test.coverage.exclude`:**
```ts
exclude: [
  "node_modules/**",
  ".next/**",
  "vitest.config.ts",
  "postcss.config.js",
  "tailwind.config.ts",
  "src/__tests__/**",
  "next.config.js",
  "next-env.d.ts",
  "src/app/**",
],
```

**Clean result:**
```
 % Coverage report from v8
-----------------|---------|----------|---------|---------|-------------------
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|----------|---------|---------|-------------------
All files        |     100 |    92.85 |     100 |     100 |
 ApiKeyCard.tsx  |     100 |     90.9 |     100 |     100 | 94
 ClientTable.tsx |     100 |      100 |     100 |     100 |
 Sidebar.tsx     |     100 |      100 |     100 |     100 |
 TopNav.tsx      |     100 |    85.71 |     100 |     100 | 59
-----------------|---------|----------|---------|---------|-------------------
```

### Open architectural decision — Vitest 4 / Next 16 major upgrade (updated with new risk data)

Consolidating everything tracked across the last three entries into one explicit record:

- **What's pending:** a breaking major-version upgrade of `next` (14 → 16) and `vitest` (2 → 4), currently deferred because both are breaking changes outside the scope of the tasks that surfaced them.
- **Why it now matters more:** installing `@vitest/coverage-v8` surfaced 2 **critical** CVEs against `vitest@2.0.5` itself — remote code execution when a malicious website is accessed while the Vitest **API** server is listening, and arbitrary file read/execute while the Vitest **UI** server is listening. These are real, confirmed-critical advisories (not the moderate/high framework-config noise tracked elsewhere), and full remediation requires the Vitest 4 line.
- **Current exposure — verified secure, not assumed:** both advisories only trigger when a Vitest server is actively listening on `--api` or `--ui`. This project's only two test entry points, `"test": "vitest run"` and `"test:coverage": "vitest run --coverage"`, both use the one-shot `run` subcommand, which never starts either server. Neither flag appears anywhere in this codebase. Current vectors are not exposed.
- **Why it still needs tracking rather than closing the issue:** `vitest run` being safe today doesn't retire the advisory — the vulnerable code is still installed, and exposure is one `vitest --ui` (a normal local-debugging habit) or one future CI/package.json change away from becoming live. This should stay an open, visible line item until the Vitest 4 upgrade actually lands, not be treated as resolved because current usage happens to avoid it.
- **Also bundled into this same upgrade:** the `esbuild`/`vite` moderate dev-server advisory (fixed by Vitest 4), the `next` high-severity advisories and the `glob`/`eslint-config-next` high-severity CLI command-injection advisory (both fixed by Next 16). Treating all of these as one combined upgrade decision rather than four separate ones, since they resolve together.

### Baseline for the conclusion of this phase

With coverage boundaries now correctly isolating business logic from framework artifacts, this is the closing baseline for the component-testing phase:

| Metric | `src/components/ui` (= `All files`) |
|---|---|
| **Statements** | **100%** |
| **Branch** | **92.85%** |
| **Functions** | **100%** |
| **Lines** | **100%** |

The two remaining uncovered branches (`ApiKeyCard.tsx:94`, `TopNav.tsx:59` — both noted in the entry above) are known and minor, not blind spots.

- **Files touched:** `vitest.config.ts`, `LOGS.md`
- **Status:** Completed. This closes the test-coverage-instrumentation work. Carried forward, unchanged: admin nav vocabulary for Clients/Settings, the dark-mode decision, the missing multi-client/API-key screens in the source Claude Design project, and the Vitest 4 / Next 16 upgrade decision detailed above.

---

<!-- Future entries go below this line, most recent last -->
