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

### [CLERK AUTHENTICATION INITIALIZATION] — 2026-07-19

- **Type:** Feature
- **Summary:** Installed `@clerk/nextjs`, added `clerkMiddleware` protection for `/dashboard` and `/settings`, wrapped the root layout in `ClerkProvider`, and set placeholder env vars — all on `feature/clerk-auth`. Two real bugs surfaced during implementation and verification (not rubber-stamped from the spec): an invalid matcher regex, and a build-breaking placeholder key format. Both fixed and verified, not just patched around.

**1. Dependency version — deviated from "latest" deliberately:** `npm install @clerk/nextjs` (unpinned) failed with `ERESOLVE` — the current `latest` dist-tag (`7.5.20`) requires `next@"^15.2.8 || ... || ^16.x"` as a peer dependency and does not support Next 14 at all. Checked peer deps across major versions via `npm view` before picking one: `@clerk/nextjs@6.39.6` declares `next: "^13.5.7 || ^14.2.25 || ^15.2.3 || ^16"`, which our pinned `next@14.2.35` satisfies cleanly. Installed `6.39.6` exactly, no `--legacy-peer-deps`/`--force` workaround needed. This is the same Next-14-vs-Next-16 fork already tracked as the open Vitest 4/Next 16 upgrade decision above — worth noting when that decision is eventually made, since it would also unlock Clerk 7.

**2. Matcher regex bug — the spec's exact string was invalid, caught before writing it:** The literal matcher array specified was `'/((?!_next|[^?]*\\.(?:html|css|js(?!on)|...|webmanifest))).*)'`. Checked it programmatically (paren-depth counter + `new RegExp(...)`) before transcribing it: it has an extra closing `)` right after `webmanifest` that closes the outer capturing group *before* `.*)`, leaving `.*` outside any group and a trailing `)` with nothing left to close — `Invalid regular expression: Unmatched ')'`. Used the correctly-balanced version of Clerk's own documented matcher instead (verified valid the same way), with one incidental content difference from the spec: `html?` (matches `.htm` and `.html`) instead of the spec's `html`-only. Everything else in the spec's middleware description — `clerkMiddleware`/`createRouteMatcher` imports, `auth.protect()` called directly on the callback's `auth` param, the `/dashboard(.*)`/`/settings(.*)` matcher — was verified correct against the actual installed `6.39.6` type declarations (`node_modules/@clerk/nextjs/dist/types/server/clerkMiddleware.d.ts`, `.../app-router/server/auth.d.ts`, `.../server/protect.d.ts`) before writing `src/middleware.ts`, since this SDK's middleware API has changed shape across major versions and memory alone isn't reliable for it.

**3. Placeholder publishable key broke the production build — found via verification beyond what this task asked for:** the task only asked for `npm run test:coverage`, which passed cleanly (existing tests never render `RootLayout`, so `ClerkProvider` wasn't exercised by them). Given this change touches the root layout and adds middleware — both load-bearing for every route — also ran `tsc --noEmit` (clean) and a full `next build` as this project's established verification pattern, and the build failed on **every single route**: `@clerk/clerk-react: The publishableKey passed to Clerk is invalid... (key=pk_test_placeholder)`. Read the actual installed validator (`node_modules/@clerk/shared/dist/runtime/keys-wr08qE7Y.js`) rather than guess at the required format: a publishable key must be `pk_test_`/`pk_live_` + base64 of a string that contains a `.` and ends in exactly one trailing `$`. Constructed a replacement (`pk_test_` + base64 of `"placeholder.clerk.accounts.dev$"`) and confirmed it passes by calling the real installed `isPublishableKey`/`parsePublishableKey` functions directly in Node before using it. Re-ran the build: all 6 static pages plus `ƒ Middleware` (78.6 kB) compiled clean. `CLERK_SECRET_KEY="sk_test_placeholder"` was left as the literal spec'd value — reasoned that middleware (and thus secret-key validation) doesn't execute during static prerendering, only at request time — and confirmed this reasoning against the actual build result rather than leaving it as an assumption.

**Files created/changed:**
- `.env.local` (created, gitignored — confirmed via `git check-ignore -v`): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (format-valid placeholder, see above), `CLERK_SECRET_KEY="sk_test_placeholder"` (literal spec value).
- `src/middleware.ts` (created): `clerkMiddleware` protecting `/dashboard(.*)` and `/settings(.*)` via `auth.protect()`; corrected matcher in `config`.
- `src/app/layout.tsx`: wrapped in `<ClerkProvider>`.
- `vitest.config.ts`: added `src/middleware.ts` to `coverage.exclude` (framework middleware registered as 0% covered, as anticipated — dragged the aggregate to 95.54/89.65/90.9/95.54 before exclusion).
- `package.json`: added `@clerk/nextjs@6.39.6`.

**Verification:**
- `npm run test:coverage` — `Test Files 4 passed (4)`, `Tests 18 passed (18)`; aggregate back to the established baseline of **100% Stmts / 92.85% Branch / 100% Funcs / 100% Lines** (unchanged from the prior entry — middleware exclusion keeps the metric meaning the same thing it did before).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean after the publishable-key fix: all 4 routes (`/`, `/dashboard`, `/settings`, `/_not-found`) statically prerendered, middleware compiled and registered.
- Real authentication (an actual sign-in flow) was **not** tested and cannot be with placeholder credentials — `pk_test_...` here decodes to a fake, non-existent frontend API domain (`placeholder.clerk.accounts.dev`), so any real Clerk API call will fail. That requires the user's real keys from an actual Clerk dashboard/account, out of scope for this branch's scaffolding step.

- **Status:** Completed. Middleware, provider, and route protection are wired and verified to build/type-check/test clean. **Not yet done:** no sign-in/sign-up UI exists yet, so a signed-out user hitting `/dashboard` or `/settings` will be redirected by `auth.protect()` toward a Clerk-hosted sign-in flow that (with placeholder keys) points at a non-existent instance — expected for this stage, but flagging so it isn't mistaken for a working auth flow. Carried forward unchanged: admin nav vocabulary, dark mode, missing admin screens in the source design, and the Vitest 4/Next 16 upgrade decision (now also gating a Clerk 7 upgrade).

---

### [CLERK CUSTOM UI & TENANT ROUTING] — 2026-07-19

- **Type:** Feature
- **Summary:** Added Clerk's routing env vars, built the `/sign-in` and `/sign-up` catch-all pages, refactored `src/middleware.ts` to the canonical Clerk v6 "protect everything except public routes" pattern, and added `src/hooks/useTenant.ts` for client-side tenant resolution. One real security-posture change and one real coverage gap surfaced — both flagged below rather than left implicit.

**1. Sign-in/sign-up pages:** `src/app/sign-in/[[...sign-in]]/page.tsx` and `src/app/sign-up/[[...sign-up]]/page.tsx`, each a centered flex container (`min-h-screen`, `bg-stone-25` — matching the design system's light-theme background token) wrapping Clerk's `<SignIn />`/`<SignUp />`. Confirmed both are exported from `@clerk/nextjs`'s main entry (not `/server`) before writing the imports. `next build` correctly marks both routes dynamic (`ƒ`), unlike the static `/dashboard`/`/settings` — expected, since Clerk's auth UI needs request-time context and can't be prerendered.

**2. Middleware refactor — a real, worth-flagging security-posture change, not just a rewrite:** Replaced the previous allow-list (`auth.protect()` only for `/dashboard(.*)` and `/settings(.*)`, everything else public by default) with the canonical Clerk v6 deny-list pattern the task specified:
  ```ts
  const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

  export default clerkMiddleware(async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  });
  ```
  This means **every route now requires authentication except `/sign-in` and `/sign-up`** — including the root `/` (which just redirects to `/dashboard`) and any route added in the future by default, rather than only the two routes explicitly named before. This is a fail-secure default (new routes are protected unless explicitly allow-listed as public, rather than accidentally left open), and matches "Clerk v6 standards" as literally requested rather than a narrower hybrid that would have preserved the old allow-list scope. Flagging plainly since it's a meaningfully broader protection surface than the previous entry established, not a cosmetic refactor.

**3. `src/hooks/useTenant.ts`:** Before writing it, read the actual installed `UseAuthReturn` discriminated union (`node_modules/@clerk/shared/dist/types/index.d.ts`) rather than assume the shape — it has exactly 4 states (not loaded; loaded+signed-out; loaded+signed-in+no-org; loaded+signed-in+with-org), which maps directly onto the requested behavior:
  ```ts
  export function useTenant(): UseTenantResult {
    const { isLoaded, isSignedIn, userId, orgId } = useAuth();
    if (!isLoaded || !isSignedIn) {
      return { tenantId: null, isLoaded, isSignedIn: !!isSignedIn };
    }
    return { tenantId: orgId ?? userId, isLoaded: true, isSignedIn: true };
  }
  ```
  `tenantId` resolves to the active organization's ID, falling back to the user's own ID in single-tenant mode, per spec. Note on "verified": this reads directly from Clerk's authenticated session state (never a client-supplied prop, query param, or localStorage value) — it is not a security boundary itself. Per `ARCHITECTURE.md`'s multi-tenancy model, actual data-access scoping (RLS policies, query filters) must still happen server-side; this hook is for client-side UI/display use only and must not be treated as the enforcement point.

**4. Coverage gap — flagged, not silently hidden or silently fixed:** `npm run test:coverage` dropped from the established 100/92.85/100/100 baseline to **97.21/89.65/90.9/97.21** because `src/hooks/useTenant.ts` is new and untested (0% — sign-in/sign-up pages are already covered by the existing `src/app/**` exclusion, so they don't show up at all). This is a materially different case from `src/middleware.ts` last entry: middleware is pure framework wiring with no branching logic of its own, which is why it was excluded; `useTenant` has real conditional logic (4 auth states → a tenant-resolution decision) that other code will depend on for tenant-scoping — exactly the kind of thing this project's own established standard (100% on business logic) exists to catch. Did **not** add `src/hooks/**` to the coverage exclude list — that would hide real logic rather than isolate framework noise, the opposite of what the exclude list is for. Recommending a follow-up unit test for `useTenant` (mocking `useAuth`'s 4 states) rather than adding it unilaterally, since it wasn't part of this task's specified steps.

**Verification (superseded by the remediation below):**
- `npm run test:coverage` — `Test Files 4 passed (4)`, `Tests 18 passed (18)`. Aggregate 97.21/89.65/90.9/97.21 (see gap above); `src/components/ui` itself unchanged at 100/92.85/100/100.
- `npm run build` — clean: `/`, `/dashboard`, `/settings`, `/_not-found` static; `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]` dynamic; middleware compiled (78.6 kB).

**Files created/changed:**
- `.env.local`: added `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`.
- `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx` (created).
- `src/middleware.ts`: refactored to public-route deny-list (see above).
- `src/hooks/useTenant.ts` (created, untested — see coverage gap above).

### 5. Coverage remediation — `useTenant.ts` unit test added

Closed the coverage gap flagged in point 4. Created `src/hooks/useTenant.test.ts`, co-located next to the hook (per this remediation's own spec) rather than under `src/__tests__/`. Mocked `@clerk/nextjs` with `vi.mock()` and used `vi.mocked(useAuth)` to control its return value per test, verified via `renderHook` from `@testing-library/react` (confirmed exported in our installed version before using it). Four cases, matching the hook's real 4-state `UseAuthReturn` shape verified in point 3:

| Case | Mocked `useAuth()` | Expected `useTenant()` result |
|---|---|---|
| Loading | `isLoaded: false` | `{ tenantId: null, isLoaded: false, isSignedIn: false }` |
| Signed out | `isLoaded: true, isSignedIn: false` | `{ tenantId: null, isLoaded: true, isSignedIn: false }` |
| Org mode | `isSignedIn: true, userId: "user_123", orgId: "org_123"` | `{ tenantId: "org_123", isLoaded: true, isSignedIn: true }` |
| Personal mode | `isSignedIn: true, userId: "user_123", orgId: null` | `{ tenantId: "user_123", isLoaded: true, isSignedIn: true }` |

**A second, structural gap surfaced and was fixed, not just papered over:** the first `test:coverage` run after adding the test showed `useTenant.ts` at a clean 100/100/100/100 as expected, but also listed `useTenant.test.ts` *itself* in the coverage report (contributing to, not just incidentally near, 100%, since a test file trivially "covers" its own straight-line statements). This is because every other test file in the project lives under `src/__tests__/components/`, covered by the existing `src/__tests__/**` exclude pattern — but this task specifically co-locates the test next to its source file, which falls outside that pattern entirely. Rather than leave a test file polluting its own metrics (or leave the exclude list dependent on a directory convention that this same task just broke), added general `"**/*.test.ts"` and `"**/*.test.tsx"` patterns to `vitest.config.ts`'s `coverage.exclude` so co-located tests are covered by pattern regardless of location, not just the ones under `src/__tests__/`.

**Final, corrected verification:**
- `npm run test:coverage` — `Test Files 5 passed (5)`, `Tests 22 passed (22)`.
  ```
  All files         |     100 |    93.75 |     100 |     100 |
   components/ui    |     100 |    92.85 |     100 |     100 |
    ApiKeyCard.tsx  |     100 |     90.9 |     100 |     100 | 94
    ClientTable.tsx |     100 |      100 |     100 |     100 |
    Sidebar.tsx     |     100 |      100 |     100 |     100 |
    TopNav.tsx      |     100 |    85.71 |     100 |     100 | 59
   hooks            |     100 |      100 |     100 |     100 |
    useTenant.ts    |     100 |      100 |     100 |     100 |
  ```
  `useTenant.ts` itself: **100% Statements / 100% Branch / 100% Functions / 100% Lines** — exactly as this remediation asked. `All files` branch sits at 93.75% (up from the pre-regression 92.85%, i.e. genuinely "pulled back up" as asked) rather than a literal 100%, entirely because of the same two pre-existing, already-documented minor branch gaps in `ApiKeyCard.tsx:94` and `TopNav.tsx:59` from the `[COVERAGE EXCLUSIONS REFINED]` entry — not a new gap introduced here.
- `npm run build` — re-ran clean after the test addition and the `vitest.config.ts` change: identical route output to before (test files and config changes don't touch the Next.js build graph).

**Files created/changed (this remediation):** `src/hooks/useTenant.test.ts` (created), `vitest.config.ts` (added `**/*.test.ts` / `**/*.test.tsx` to `coverage.exclude`).

- **Status:** Completed. `useTenant.ts` coverage gap closed at 100/100/100/100; the test-file-self-pollution issue this surfaced is also fixed generally, not just for this one file. Carried forward, unchanged: admin nav vocabulary, dark mode, missing admin screens in the source design, and the Vitest 4/Next 16/Clerk 7 upgrade decision.

---

### [UI AUTHENTICATION BINDING & FINALIZATION] — 2026-07-19

- **Type:** Feature
- **Summary:** Replaced `Sidebar.tsx`'s mock avatar/name/logout footer with Clerk's live `<UserButton afterSignOutUrl="/" />`, giving the app its first real (non-callback-stub) session-termination path. Updated the existing `Sidebar.test.tsx` with a minimal `@clerk/nextjs` mock rather than requiring a real `ClerkProvider` in tests. All pre-existing tests, coverage, and the build remain green.

**1. Where the mock profile structure actually lived:** Only `Sidebar.tsx` had both a mock avatar *and* a logout action (a footer block with `client.initials` in a hand-drawn circle, `client.name`/`client.property` text, and a `LogOut` icon button wired to an `onLogout` callback prop that was never connected to anything real). `TopNav.tsx` has a display-only avatar chip (`userName`/`userInitials`) with no logout control at all — not touched, deliberately: adding a second `UserButton` there would put two separate account/logout menus on the same screen (Shell composes both Sidebar and TopNav together), which the original pulled design never had (only one identity control, in the sidebar footer). Consolidating into the one place that actually had a logout affordance matches that original intent rather than duplicating controls.

**2. `Sidebar.tsx` changes:**
  - Removed the `LogOut` icon import, the avatar-circle `div`, the name/property text block, and the `onLogout` prop/button entirely.
  - Added `import { UserButton } from "@clerk/nextjs"` and render `<UserButton afterSignOutUrl="/" />` in their place.
  - `SidebarClient` narrowed from `{ initials, name, property }` to just `{ property }` — `initials`/`name` are no longer read by this component now that Clerk's own `UserButton` supplies the real logged-in user's avatar/identity directly; `property` is unrelated app data (which property the client owns) that Clerk has no knowledge of, so it's kept and rendered next to the button.
  - `dashboard/page.tsx` / `settings/page.tsx` needed **no changes** — both still construct a `CURRENT_USER` object with `initials`/`name`/`property` (still consumed by `TopNav`'s separate display props) and pass the whole object to `Sidebar`'s `client` prop; TypeScript's excess-property check only applies to inline object literals, not variables, so the now-narrower `SidebarClient` type still accepts it without modification. Confirmed via a clean `tsc --noEmit`, not assumed.

**3. `afterSignOutUrl` — used exactly as specified, but flagging a real deprecation notice:** checked the actual installed `UserButtonProps` type (`node_modules/@clerk/shared/dist/types/index.d.ts`) before using this prop. It exists and works, but carries `@deprecated Configure afterSignOutUrl as a global configuration, either in <ClerkProvider/> or in await Clerk.load()`. It is not broken or removed — unlike the middleware matcher regex from an earlier entry, this doesn't need a substitution — so it was used exactly as the task specified. Noting the deprecation for a future cleanup pass (moving the URL onto `<ClerkProvider afterSignOutUrl="/">` globally) rather than silently leaving it undocumented or unilaterally restructuring what was explicitly asked for.

**4. Minimal test mock strategy:** `Sidebar.test.tsx` now mocks the whole `@clerk/nextjs` module:
  ```tsx
  vi.mock("@clerk/nextjs", () => ({
    UserButton: (props: { afterSignOutUrl?: string }) => (
      <div data-testid="user-button" data-after-sign-out-url={props.afterSignOutUrl} />
    ),
  }));
  ```
  This avoids needing a real `ClerkProvider` wrapper or hitting Clerk's actual (network-dependent) component internals in unit tests — matching how `ApiKeyCard`/`ClientTable` tests already mock external concerns rather than integrate with them. The old "shows a visible log out control and invokes onLogout when clicked" test was removed (that prop/button no longer exists — sign-out is now entirely internal to Clerk's own component, not ours to unit-test) and replaced with a test that the mocked `UserButton` renders and is wired with `afterSignOutUrl="/"`, plus the old identity assertions were narrowed to just the still-real `property` text (the `client.name`/`initials` assertions were removed along with the fields they tested).

**Verification:**
- `npm run test:coverage` — `Test Files 5 passed (5)`, `Tests 22 passed (22)`. `Sidebar.tsx` unchanged at 100/100/100/100; project aggregate unchanged at 100/93.75/100/100 (identical to the prior entry — no regression, no new gap).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean: same 6 routes as before. Worth noting: `/dashboard` and `/settings` First Load JS grew from ~91 kB to **121 kB** (Clerk's `UserButton` pulls in more of its client SDK) — expected, not a regression. Both remain statically prerendered (`○`) despite embedding a live Clerk component; static generation and Clerk's client-side hydration are independent of each other.

**Files created/changed:**
- `src/components/ui/Sidebar.tsx`: mock avatar/name/logout footer replaced with `<UserButton afterSignOutUrl="/" />`; `SidebarClient` narrowed to `{ property }`.
- `src/__tests__/components/Sidebar.test.tsx`: added `@clerk/nextjs` mock; updated/removed assertions to match.
- `dashboard/page.tsx`, `settings/page.tsx`: verified compatible, no changes needed.

- **Status:** Completed. This is the final integration step on `feature/clerk-auth` per this task's framing. Carried forward, unchanged and still open: the `afterSignOutUrl` deprecation cleanup (move to `ClerkProvider`-level config), admin nav vocabulary for Clients/Settings, dark mode, missing admin screens in the source Claude Design project, and the Vitest 4/Next 16/Clerk 7 upgrade decision.

---

## 2026-07-19 — Feature: Property, Payments, Projects Explorer, and Rental Roadmap

- **Type:** Feature
- **Summary:** Built five new `/dashboard` routes (property, payments, projects list + detail, rental) backed by five new presentational components, plus a shared `Project` type/mock-data module and required unit tests for three of them (Projects Explorer, DelayPenalty, RentalRoadmap). Wired the sidebar's nav items to real routes for the first time (they were dead buttons before). All requested tests pass; two components were left deliberately untested since no test was requested for them, flagged below rather than silently left ambiguous.

### Architectural deviation from the literal request — and why
The task described tests for logic living directly in `app/dashboard/*/page.tsx` files. This project's established convention (every prior entry) is the opposite: `src/app/**` pages are thin, untested compositions; the actual logic and its tests live in `src/components/ui/`. Resolved the conflict by keeping that convention — built the real logic as testable components and made every new `page.tsx` a thin wrapper that just renders one, exactly like the existing `dashboard/page.tsx` / `settings/page.tsx`. This satisfies "the feature lives at that route" and "it's tested" simultaneously without introducing a second, page-level testing pattern.

### New shared data layer
- `src/lib/projects.ts` — `Project` interface (`id, name, address, area, units, availableUnits, deliveryDate, contractDate, floor, sqm, energyClass, pptUrl`, exactly as specified) plus `MOCK_PROJECTS` (5 distinct browsable catalog listings — Paros, Rethymno, Athens, Nafplio, Santorini, chosen with non-overlapping name/area substrings to avoid the kind of test ambiguity caught in an earlier entry) and `MOCK_OWNED_PROPERTY` (Villa Elytra — the client's *own* unit, deliberately separate from the browsable catalog: "my property" and "available projects to browse" are different concepts, so they don't share a mock record).

### Components created (`src/components/ui/`)
| File | Tested? | Notes |
|---|---|---|
| `DelayPenalty.tsx` | Yes (2 tests) | `role="alert"` + `bg-red-50`/`text-red-700` when delayed; `role="status"` + `bg-green-50`/`text-green-700` when not. Currency via `Intl.NumberFormat("en-US", {style:"currency",currency:"EUR"})` — verified via a real Node call that this produces exactly `€1,250.00` before writing the test, not assumed. |
| `PropertyAssetCard.tsx` | **No — not requested** | Maps link (`encodeURIComponent`-encoded address, `target="_blank" rel="noopener noreferrer"`) + `aspect-video w-full max-w-4xl` PPT iframe (`view.officeapps.live.com` embed pattern — Microsoft's real Office Online viewer URL shape, not an invented domain). |
| `ProjectsExplorer.tsx` | Yes (4 tests) | Client-side filter across name/address/area; a `role="switch"` toggle between an HTML `<table>` and a card grid (`data-testid="projects-grid"`). Reached 100/100/100/100 after adding one more test for the empty-results state, which the first coverage run caught as missing. |
| `ProjectDetail.tsx` | **No — not requested** | Key-value `<dl>` spec grid (9 fields), same maps link + PPT iframe pattern as `PropertyAssetCard`. |
| `RentalRoadmap.tsx` | Yes (3 tests) | Reads `useUser()` from `@clerk/nextjs` — checked the actual installed `UseUserReturn`/`UserPublicMetadata` types before writing it: `publicMetadata` is `{ [k: string]: unknown }`, so `rentalStageIndex` is read via a runtime `typeof value === "number"` guard, not a bare type-assertion cast — a genuinely safer read, matching "safely reads" more literally than a cast would. Active step gets `aria-current="step"` (the standards-correct ARIA token for exactly this case) plus `animate-pulse` on its indicator; every step also renders a visible "Completed"/"Active"/"Pending" text badge so status is queryable via plain `getAllByText`, not custom test-only markers. |

### Coverage gap — flagged deliberately, not fixed unilaterally
`PropertyAssetCard.tsx` and `ProjectDetail.tsx` sit at 0% coverage. No test was requested for either (the task's test-requirements section named exactly three targets: Projects Explorer, Payments/DelayPenalty, Rental Roadmap). This is inconsistent with this project's own established norm of testing everything under `src/components/ui/`, so it's called out explicitly rather than left to blend in with the otherwise-100% components. Did not add tests for these two unilaterally, given how large this task already is — flagging for a decision rather than silently expanding scope further.

### Sidebar navigation — made real for the first time
`SIDEBAR_NAV_ITEMS` previously had no `href` at all; nav buttons called an `onNavigate` callback prop that **no page ever supplied** (confirmed by inspection before changing anything) — clicking any of them did nothing. Since the whole point of these five new pages is to be reachable, this was fixed as part of this task rather than left broken:
- Every nav item now carries a real `href`; the `<button onClick>` became a Next.js `<Link href>`. The dead `onNavigate` prop was removed entirely (not deprecated-and-kept — it had zero callers).
- Added `property` → `/dashboard/property` and `projects` → `/dashboard/projects` as new nav entries (`Building2`/`LayoutGrid` icons).
- **Two nav items now point at routes that don't exist yet**: `construction` → `/dashboard/construction` and `visa` → `/dashboard/visa` will 404 if clicked. This isn't a new regression (they were equally non-functional as dead buttons before), but it's more visible now that they're real links. Out of scope for this task — flagging rather than silently building two more unrequested pages.
- `Sidebar.test.tsx` updated accordingly: nav items are now asserted via `getByRole("link")` + `href` attribute instead of `getByRole("button")` + a click-triggered callback spy.

### Verification
- `npx tsc --noEmit` — clean.
- `npm run test:coverage` — `Test Files 8 passed (8)`, `Tests 31 passed (31)`.
  ```
  ApiKeyCard.tsx    100 / 90.9 / 100 / 100  (pre-existing gap, line 94)
  ClientTable.tsx   100 / 100  / 100 / 100
  DelayPenalty.tsx  100 / 100  / 100 / 100
  ProjectDetail.tsx   0 / 0    / 0   / 0    (untested — see above)
  ProjectsExplorer  100 / 100  / 100 / 100
  PropertyAssetCard   0 / 0    / 0   / 0    (untested — see above)
  RentalRoadmap.tsx 100 / 100  / 100 / 100
  Sidebar.tsx       100 / 100  / 100 / 100
  TopNav.tsx        100 / 85.71/ 100 / 100  (pre-existing gap, line 59)
  useTenant.ts      100 / 100  / 100 / 100
  projects.ts       100 / 100  / 100 / 100
  ```
- `npm run build` — clean, 15 total routes. Added `generateStaticParams()` to `dashboard/projects/[id]/page.tsx` so all 5 mock project detail pages statically prerender (`●` SSG) instead of the default on-demand dynamic rendering — a small production-readiness improvement beyond the literal ask, since the detail-page set is known and finite.

### Design-language note
Used plain Tailwind palette classes (`red-50/700`, `green-50/700`, `blue-500`, `gray-200`) throughout these new components rather than this project's established custom design tokens (`coral-*`, `olive-*`, `aegean-*`, `stone-*`). The task's own spec was explicit about literal classes for the penalty banner (`bg-red-50 text-red-700`); followed that same literal-Tailwind style for the rest of the new components for internal consistency, rather than mixing token systems. This does mean these five new components visually diverge slightly from the rest of the app's custom-token palette — noting it rather than letting two color systems coexist silently.

- **Files touched:** `src/lib/projects.ts` (created), `src/components/ui/DelayPenalty.tsx`, `PropertyAssetCard.tsx`, `ProjectsExplorer.tsx`, `ProjectDetail.tsx`, `RentalRoadmap.tsx` (all created), `src/components/ui/Sidebar.tsx` (nav items + routing), `src/__tests__/components/DelayPenalty.test.tsx`, `ProjectsExplorer.test.tsx`, `RentalRoadmap.test.tsx` (created), `Sidebar.test.tsx` (updated), `src/app/dashboard/property/page.tsx`, `payments/page.tsx`, `projects/page.tsx`, `projects/[id]/page.tsx`, `rental/page.tsx` (all created), `LOGS.md`.
- **Status:** Completed. Open decisions: whether to test `PropertyAssetCard`/`ProjectDetail` for consistency with the rest of the codebase, whether to build the still-missing `/dashboard/construction` and `/dashboard/visa` pages the sidebar now links to, and the color-system split (literal Tailwind vs. custom tokens) noted above. Carried forward unchanged: admin nav vocabulary, dark mode, missing admin screens in the source design, `afterSignOutUrl` deprecation cleanup, and the Vitest 4/Next 16/Clerk 7 upgrade decision.

---

## 2026-07-19 — Feature: Prisma Schema & Supabase RLS Migration

- **Type:** Feature
- **Summary:** Wrote `prisma/schema.prisma` (7 models: `tenants`, `users`, `properties`, `property_ownerships`, `payment_ledger`, `encrypted_api_keys`, `ai_logs`) and `supabase/migrations/0001_init.sql` (matching DDL + Clerk-aware RLS). Both verified for real — `prisma validate`/`format`/`generate` all pass, and a mechanical script diffing every table/column name between the two files confirms 0 mismatches across all 7 tables. Also found and reported **real** mismatches between this message's types and code already built two entries ago — the actual point of being asked to verify, not just a formality.

### Pre-existing project state discovered, not assumed
Found `prisma/schema.prisma`, `prisma.config.ts`, and a `.env` with real Supabase credentials already present — `prisma init` and `@supabase/supabase-js`/`@prisma/client`/`prisma` had been added outside this conversation. Read all three before writing anything:
- The existing schema stub uses `provider = "prisma-client"` (Prisma 7's new generator), not the legacy `prisma-client-js` — matched this instead of overwriting it with an assumption. Confirmed the installed version is genuinely `7.8.0` before trusting this.
- `.env`'s auto-generated header comment states Prisma no longer auto-loads `.env` — a `prisma.config.ts` importing `dotenv/config` is required. One already existed and does this correctly, but the `dotenv` package it imports was only present as an *undeclared transitive dependency*, not a real project dependency — fixed by adding `"dotenv": "17.4.2"` to `package.json` explicitly (matching the version already on disk) and running `npm install`.
- **`.env` contains a real Supabase database password.** Read the file (necessary to know what already existed) but never echoed the value anywhere, same handling as the Clerk secret key two entries ago.

### A real, caught-by-actually-running-it schema bug
Initially wrote `datasource db { url = env("DATABASE_URL") directUrl = env("DIRECT_URL") }`, the standard Prisma 5/6 Supabase pattern. Ran `npx prisma validate` rather than assume this was still correct — it failed:
```
Error: The datasource property `url` is no longer supported in schema files... Error: The datasource property `directUrl` is no longer supported...
```
Prisma 7 moved connection config entirely into `prisma.config.ts`; checked `@prisma/config`'s actual shipped type definitions (`Datasource = { url?: string; shadowDatabaseUrl?: string }`) rather than guess a replacement — there is no `directUrl` slot at all in the new model. Fixed the schema's `datasource` block to just `{ provider = "postgresql" }` and left `prisma.config.ts`'s existing `datasource: { url: process.env["DATABASE_URL"] }` as the actual connection point. The pooled/direct split matters less here anyway, since this project uses hand-written Supabase SQL migrations, not `prisma migrate`. Re-ran `prisma validate` clean, then `prisma format` and `prisma generate` (client generated successfully to `./generated/prisma`, matching the pre-existing `.gitignore` entry exactly) — all before this entry was written, not after.

### The actual verification this task asked for — real mismatches found
1. **`floor` — a genuine type conflict, not a naming nit.** The `Project` mock data built in `src/lib/projects.ts` two entries ago uses `floor: string` with values like `"1-3"`, `"Ground + 1"`, `"2-6"` — free-text ranges. This message's `Property.floor: number` cannot represent that data at all. Built the schema to the new, authoritative spec (`floor Int`) since that's what this message asked for, but the existing frontend mock data is now incompatible with it and needs updating — not silently glossed over.
2. **`units` → `totalUnits`**, and **`mapUrl`** now a stored field rather than computed client-side via `encodeURIComponent(address)` (as built in `PropertyAssetCard.tsx`/`ProjectDetail.tsx`). Straightforward renames/relocations, but real ones — the frontend doesn't currently produce or expect either.
3. **`RentalStage` completely conflicts with `RentalRoadmap.tsx`'s hardcoded stages — the most significant mismatch found.** The component (built two entries ago) hardcodes `["Project Delivered", "Mandate Signed", "ID Photo", "Keys Received", "Property Inspected", "Energy Certificate Ready", "Marketing", "Tenant Interview & Selection", "Lease Agreement Signed", "Property Leased"]` — a post-delivery rental/leasing workflow. This message's `RentalStage` enum (`RESERVATION` → ... → `HANDOVER` → `RENTAL_ACTIVE`) is a full purchase-through-occupancy investment lifecycle — a different business process that happens to also have 10 steps. Built the schema to this message's enum since it's the authoritative backend spec, but `RentalRoadmap.tsx` is not updated to match — it would currently display entirely wrong stage names against real backend data. Documented inline in `schema.prisma` at the `RentalStage` enum itself, not just here.
4. **Where `rentalStage` actually lives — a real architectural gap, not just a mismatch.** The current frontend reads stage from `user.publicMetadata.rentalStageIndex` (a bare number on the Clerk user), not from any database table — Clerk metadata isn't a sound place for per-property transactional state, especially once a user can own more than one property. Added `PropertyOwnership`, a join model between `User` and `Property` (not explicitly given in this message's types, but required for `rentalStage` to be storable at all against a specific investment rather than a bare per-user scalar) — mirrors `PaymentLedger` already pairing `userId` + `propertyId`. Recommended follow-up: migrate stage tracking off Clerk metadata onto this table; not done here.
5. **`Role.ADMIN` (uppercase) vs. the given admin check (`publicMetadata.role === 'admin'`, lowercase)** — the message's own two lines of spec disagree on casing. Treated as two independent systems that are allowed to differ: the Postgres/Prisma `Role` enum stays uppercase (standard convention, under this schema's own control), while the RLS `is_admin()` function checks the literal lowercase `'admin'` string against Clerk's externally-managed JWT claim, exactly as the comment specifies. Commented explicitly in the SQL so this isn't mistaken for an inconsistency later.
6. **`encrypted_api_keys` and `ai_logs` included even though this message didn't ask for them** — ARCHITECTURE.md and CLAUDE.md already gave exact shapes for both as permanent, binding specs; a "complete" schema that omitted them would itself be a mismatch against this project's own established docs. `ai_logs.status` was tightened from CLAUDE.md's loose `varchar` to a proper `AiLogStatus` enum (`RUNNING`/`SUCCESS`/`FAILED`) — a deliberate improvement, called out rather than silently changed.

### RLS design notes
- **Auth is Clerk, not Supabase Auth** — every policy depends on Supabase being configured with Clerk as a Third-Party Auth provider, and `is_admin()` additionally depends on a custom Clerk JWT template forwarding `publicMetadata` (not present by default). Both requirements are commented at the top of the SQL file and inline at `is_admin()`, since skipping either doesn't error — it silently makes every admin-gated policy deny everything, the kind of failure mode that's easy to misdiagnose as "RLS is broken" rather than "the JWT template is missing."
- **`current_tenant_id()` requires `SECURITY DEFINER`, not by convention but by necessity** — it queries `public.users`, which itself has RLS depending on `current_tenant_id()`. Without `SECURITY DEFINER` (plus `set search_path` as the standard hardening that must accompany it), this is a circular lockout: nobody could resolve their own tenant without already knowing it. Commented inline in the SQL at the function definition.
- Catalog data (`properties`) is tenant-wide readable (browsing is not role-gated); `payment_ledger` and `property_ownerships` are scoped to the row's own `user_id` or admin; `encrypted_api_keys` and `ai_logs` are admin-only, full stop, with no non-admin read path at all.

### Verification
- `npx prisma validate` — clean (after the datasource fix above).
- `npx prisma format` — clean.
- `npx prisma generate` — client generated to `./generated/prisma`.
- Mechanical name-diff script (table/column names extracted from both files via regex, compared set-by-set): **0 mismatches across all 7 tables** (`tenants` 3 cols, `users` 6, `properties` 18, `property_ownerships` 7, `payment_ledger` 11, `encrypted_api_keys` 7, `ai_logs` 9).
- `npm install` after adding `dotenv` — audit went from 11 to 14 findings (7 moderate, 5 high, 2 critical). Checked the structured diff before assuming `dotenv` was the cause: the 3 new findings (`@hono/node-server`, `@prisma/dev`, `prisma` itself) all trace to `prisma@7.8.0`'s bundled local dev-server tooling, already latent in `package.json` before this entry (added outside this conversation) — not introduced by `dotenv` (a zero-dependency package) or by anything written here. Dev-CLI-only exposure, not production runtime; noted rather than chased mid-task, consistent with how the Vitest/eslint-config-next dev-only findings were handled in earlier entries.

- **Files touched:** `prisma/schema.prisma` (rewritten from the `prisma init` stub), `supabase/migrations/0001_init.sql` (created), `package.json` (`dotenv` added), `LOGS.md`.
- **Status:** Completed. Real follow-ups surfaced, not yet done: reconcile `src/lib/projects.ts`'s mock `floor`/`units` shape with the new `Property` type, update `RentalRoadmap.tsx` to the new `RentalStage` enum, and move rental-stage tracking off Clerk `publicMetadata` onto `PropertyOwnership`. `DATABASE_URL`/`DIRECT_URL` env var setup was found already in place (`.env`, pre-existing) rather than needing to be added. Carried forward unchanged: admin nav vocabulary, dark mode, missing admin screens in the source design, `afterSignOutUrl` deprecation cleanup, the still-missing `/dashboard/construction`/`/dashboard/visa` pages, and the Vitest 4/Next 16/Clerk 7 upgrade decision (now also touching the newly-found Prisma dev-tooling advisories).

---

## 2026-07-19 — Feature: Bridging the Frontend↔Backend Gap (Supabase Client, Clerk Webhook, ApiKeyCard Realignment, Real Projects Data)

- **Type:** Feature
- **Summary:** Implemented all four requested pieces (`src/lib/supabaseClient.ts`, the Clerk webhook sync route, `EncryptedApiKey` schema realignment + migration, and a real Prisma-backed `getActiveProjects()`) — but three real conflicts with the actual codebase surfaced before any of it could be written correctly, one of which needed the user's input rather than a unilateral guess. All four pieces are verified: `prisma validate`, `tsc --noEmit`, the full test suite (31/31, unchanged), and `next build` all pass clean.

### Blocking discrepancy resolved with the user: `Profile` vs `User`
Tasks 2 and 3 both referenced a `Profile` model and said to "keep existing relation bindings to Profile." Checked `schema.prisma` before writing anything: there is no `Profile` model, and `EncryptedApiKey` has never had any relation to `User` at all — only to `Tenant` (BYOK keys are tenant-level shared credentials by original design, not per-user). This wasn't a naming nit I could safely resolve alone: one interpretation (same model, different name) needed zero schema changes; the other (an actual rename) would mean editing an already-"shipped" migration's table name and every RLS reference to it. Asked directly rather than guess; confirmed answer: treat `Profile` as the existing `User` model, no rename.

### Task 1 — `src/lib/supabaseClient.ts`
`getSupabaseClient(clerkToken?)` builds a **new** client per call rather than a shared singleton — deliberately, since Next.js server code handles concurrent requests from different users in the same process, and a shared client with mutated auth state would risk one request's token leaking into another's. Verified `auth.persistSession`/`autoRefreshToken`/`global.headers` against the actual installed `@supabase/supabase-js@2.110.7` type definitions before using them (all three real, correctly named). `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` do not exist in `.env`/`.env.local` yet — flagged, not fabricated.

### Task 2 — Clerk webhook → Postgres sync
- Verified `svix`'s actual `Webhook` class (not installed until this task) before writing against it. Implemented manual svix verification, as literally specified, rather than switching to Clerk's own `verifyWebhook()` convenience wrapper (which exists, in `@clerk/nextjs/webhooks`, and uses `standardwebhooks` internally) — the task named "the svix library" explicitly and repeatedly, and both approaches are fully correct, so the literal instruction was honored rather than substituted. Noted inline that Clerk's own env var default for that wrapper is actually `CLERK_WEBHOOK_SIGNING_SECRET`, not `CLERK_WEBHOOK_SECRET`, in case this project switches to it later.
- **Real gap found and resolved, not glossed over:** `User.tenantId` is required with no default, and nothing — not Clerk's webhook payload, not anything built so far — establishes which tenant a brand-new user belongs to (no Clerk Organizations wiring, no onboarding flow exists). Resolved by upserting against one fixed, well-known `Tenant` id as a bootstrap default, atomically (safe against concurrent webhook deliveries hitting a cold start), clearly commented as a temporary simplification pending real tenant provisioning.
- Role resolution matches the spec exactly: `publicMetadata.role === 'admin'` (lowercase, Clerk-side) → `Role.ADMIN`; anything else → `Role.TENANT`.
- The upsert is keyed on the Clerk user id itself (the model's primary key), correctly idempotent against Clerk's at-least-once webhook delivery.

### Task 3 — `EncryptedApiKey` realignment
Added `label: String`, `maskedKey: String` (`@map("masked_key")`), and `status: ApiKeyStatus` (`ACTIVE`/`REVOKED`, `@default(ACTIVE)`) to the model, preserving the real existing `Tenant` relation (there was no `User` relation to preserve — noted in the schema comment so this isn't mistaken for an oversight later). `supabase/migrations/0002_api_key_sync.sql`: `status` gets a safe one-step `NOT NULL DEFAULT 'ACTIVE'` add (semantically correct for any pre-existing row too); `label`/`masked_key` have no natural backfill value, so both use the standard safe 3-step pattern (add nullable → backfill with an explicit, honestly-labeled placeholder → set `NOT NULL`) rather than risk failing on non-empty tables.

### Task 4 — `src/lib/projects.ts` refactor, and the architectural problem it exposed
The task asked for `getActiveProjects()` to live directly in `src/lib/projects.ts`. Checked who actually imports from that file first: `ProjectsExplorer.tsx` (a `"use client"` component) imports `MOCK_PROJECTS` from it as a real runtime value, not just the `Project` type. Prisma Client is Node-only — putting a Prisma-querying function in the same module a Client Component pulls a runtime value from would either break the client bundle outright or silently rely on tree-shaking correctly eliding a non-side-effect-free import, which isn't a safe bet. Confirmed this isn't theoretical by checking how the `server-only` package actually enforces its guard (an unconditional `throw` on any resolution path except Next's specific `"react-server"` bundler condition — meaning it would have broken Vitest too, not just the browser bundle, since Vitest doesn't set that condition).

Split the file instead of forcing it into one:
- `src/lib/projects.ts` — client/test-safe: the `Project` type (now matching `Property` field-for-field: `totalUnits` not `units`, `floor`/`sqm` as real `number`s, plus `status`/`imageUrl`/`mapUrl`) and the mock constants. No `server-only`, no Prisma import.
- `src/lib/data/projects.ts` (new, `server-only`) — `getActiveProjects(tenantId)` and a small companion `getProjectById(id, tenantId)` (added because the detail page needs a single-record lookup that isn't filtered by availability the way the list is — a natural companion to the function actually requested, not scope creep). Both map Prisma's `Property` rows to the frontend `Project` shape explicitly (an intentional boundary, not a blind pass-through, so a future enum/field drift fails to compile instead of drifting silently) and convert `DateTime` → ISO date strings, since `Date` objects aren't JSON-safe across a server→client boundary and the existing components already render dates as plain strings.
- `src/lib/auth/currentTenant.ts` (new, `server-only`) — `getCurrentTenantId()`, resolving the *real* database tenant UUID via Clerk's server-side `auth()` + a `users` lookup.
- **The most important finding in this entire task, surfaced here for the first time:** Prisma connects directly to Postgres with its own connection string — it does not go through PostgREST, so **Supabase RLS provides it zero protection**. Every Prisma query touching tenant-scoped data must filter by `tenantId` in application code, or the RLS built two entries ago is a false sense of security the moment Prisma is the one running the query. This is why `getActiveProjects`/`getProjectById` take `tenantId` as a required parameter with no default, and why `getCurrentTenantId()` exists at all rather than reusing the client-side `useTenant()` hook (which returns a Clerk-format string id, never the real Postgres UUID — already flagged as mismatched two entries ago, now concretely why it matters).
- New Next.js path alias `@/generated/*` → `./generated/*` added (`tsconfig.json` + `vitest.config.ts`), since the Prisma 7 client output lives at the project root, outside `src/`, with no `package.json`/index file of its own to resolve through.
- New shared singleton: `src/lib/prisma.ts` (the standard `globalThis`-cached pattern, avoiding a fresh connection pool per Next.js Fast Refresh reload).

### A second, unplanned Prisma 7 discovery — caught only by actually compiling
`tsc --noEmit` failed with `Expected 1 arguments, but got 0` on `new PrismaClient()`. Prisma 7's new `prisma-client` generator requires an explicit **driver adapter** — there is no more implicit `DATABASE_URL` resolution inside the client itself. Installed `@prisma/adapter-pg@7.8.0` (version-matched to the installed `prisma`/`@prisma/client`), verified its actual constructor signature (`new PrismaPg(connectionString)`) before using it, and wired it into `src/lib/prisma.ts`. Also fixed two now-real (not hypothetical) `tsc` errors this same run: `ProjectDetail.tsx`/`PropertyAssetCard.tsx` passed `pptUrl` (now `string | null`) straight into `<iframe src>`, which only accepts `string | undefined` — fixed both with `?? undefined`.

### Ripple fixes required to make Task 4 actually compile and run (beyond the 4 named files)
- `ProjectsExplorer.tsx`: dropped the `MOCK_PROJECTS` import/default; `projects` is now a required prop, supplied by the calling page.
- `ProjectDetail.tsx`, `ProjectsExplorer.tsx`: every `.units` reference → `.totalUnits`; `ProjectDetail`'s floor row wrapped in `String()` (now a number).
- `src/app/dashboard/projects/page.tsx`: now an async Server Component calling `getCurrentTenantId()` → `getActiveProjects()`, rendering an empty catalog (not throwing) if no `users` row exists yet for the signed-in Clerk account.
- `src/app/dashboard/projects/[id]/page.tsx`: same pattern with `getProjectById()`. **Removed `generateStaticParams()`** — it made sense when the same 5 mock projects were shown to everyone regardless of auth; it doesn't once data is genuinely tenant-scoped, since there's no "every possible id across every tenant" to enumerate at build time. Confirmed via the build output: this route is now `ƒ` (dynamic) instead of `●` (SSG).
- `ProjectsExplorer.test.tsx`: passes `projects={MOCK_PROJECTS}` explicitly now that it's a required prop.

### Coverage — honest gaps flagged, not hidden or silently swept into exclusions
- Fixed a real false-positive first: `prisma.config.ts` was appearing in the coverage report despite never being executed by any test (same category as `next.config.js`) — added to the exclude list.
- Added `src/lib/prisma.ts` and `src/lib/supabaseClient.ts` to the exclude list — both are thin instantiation wiring with no branching logic of their own, the same reasoning already applied to `src/middleware.ts`.
- **Deliberately did not exclude** `src/lib/auth/currentTenant.ts` or `src/lib/data/projects.ts` — both contain real logic (early-return branches, a DB lookup, explicit field-mapping/date-conversion rules) and remain at 0%, honestly reported, matching how `useTenant.ts`'s gap was handled two entries ago before it was closed with a real test.
- **Found, and not swept under the rug:** the Clerk webhook route (`src/app/api/webhooks/clerk/route.ts`) doesn't appear in the coverage report *at all* — it's silently caught by the existing `src/app/**` exclusion, which was written for thin page compositions, not Route Handlers with real embedded logic (signature verification, role resolution, tenant bootstrapping). That exclusion pattern is now overly broad; the route is untested and effectively invisible in the report, which is worse than being visibly at 0%. Flagging precisely rather than either quietly fixing the pattern or leaving it unmentioned.
- Final: `Test Files 8 passed (8)`, `Tests 31 passed (31)` (unchanged from before this task), aggregate 79.73%/92.85%/82.6%/79.73%, with the honest gaps above.

### Verification
`npx prisma validate` clean → `npx prisma generate` (regenerated after the `EncryptedApiKey` change) → `npx tsc --noEmit` clean (after fixing the two discoveries above) → `npm run test:coverage` 31/31 → `npm run build` clean, 11 routes, `/dashboard/projects` and `/dashboard/projects/[id]` now correctly dynamic, `/api/webhooks/clerk` present at 0 B (as expected for a Route Handler with no client bundle) — and no server-only/Prisma code leaked into any client bundle, which this build would have failed loudly on on if the file split above had been wrong.

- **Files touched:** `src/lib/supabaseClient.ts`, `src/lib/prisma.ts`, `src/lib/auth/currentTenant.ts`, `src/lib/data/projects.ts`, `src/app/api/webhooks/clerk/route.ts` (all created); `prisma/schema.prisma` (`ApiKeyStatus` enum + `EncryptedApiKey` fields), `supabase/migrations/0002_api_key_sync.sql` (created); `src/lib/projects.ts` (rewritten), `src/components/ui/ProjectsExplorer.tsx`, `ProjectDetail.tsx`, `PropertyAssetCard.tsx`, `src/app/dashboard/projects/page.tsx`, `projects/[id]/page.tsx`, `src/__tests__/components/ProjectsExplorer.test.tsx` (all updated); `tsconfig.json`, `vitest.config.ts` (new `@/generated` alias + coverage exclusions); `package.json` (`svix`, `server-only`, `@prisma/adapter-pg` added); `LOGS.md`.
- **Status:** Completed. Real, not-yet-done follow-ups: add `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`CLERK_WEBHOOK_SECRET` to the env files with real values; configure Clerk as a Supabase Third-Party Auth provider (nothing calls `getSupabaseClient()` from application code yet — it exists but is unwired); replace the fixed-tenant-id bootstrap in the webhook with real tenant provisioning once it exists; tests for `currentTenant.ts`/`data/projects.ts`/the webhook route; narrowing the `src/app/**` coverage exclusion so Route Handlers with real logic aren't invisible. Carried forward unchanged: `RentalRoadmap.tsx`'s stage mismatch, `PropertyAssetCard`/`ProjectDetail` still untested, admin nav vocabulary, dark mode, missing admin screens in the source design, `afterSignOutUrl` deprecation cleanup, the still-missing `/dashboard/construction`/`/dashboard/visa` pages, and the Vitest 4/Next 16/Clerk 7 upgrade decision.

---

## 2026-07-19 — Feature: Closing the Supabase Third-Party Auth Gap (Dashboard Guide, Real `/dashboard/property` Wiring, Test Coverage for the 3 Untested Server Files)

- **Type:** Feature
- **Summary:** Closed the three gaps flagged at the end of the previous entry: documented the exact Clerk↔Supabase dashboard configuration (Task 1), wired real Supabase-backed data into `/dashboard/property` (Task 2), and wrote real Vitest suites for `data/projects.ts`, `data/propertyOwnership.ts` (new), `supabaseClient.ts`, and the Clerk webhook route (Task 3). One architectural conflict surfaced and was resolved by omission rather than by silently picking a side; one stale, never-actually-verified doc comment from the previous entry was caught and corrected; two real Vitest bugs were found and fixed only because the tests were actually run, not just written.

### Task 1 — the deprecated-mechanism catch
Before writing the integration guide, checked the previous entry's own claim (in `0001_init.sql`'s header comment) that `publicMetadata` requires "a custom Clerk JWT Template" against Clerk's and Supabase's live docs (`WebFetch`, not memory — see `ARCHITECTURE.md` for sources). That mechanism was deprecated by Clerk on **2025-04-01**; it had never actually been verified against live docs when first written, only assumed. Corrected the `0001_init.sql` comment in place and wrote the real current mechanism (native Third-Party Auth: Clerk Dashboard → activate the Supabase integration → copy the Clerk domain → paste into Supabase Dashboard → Authentication → Third-Party Auth) as a new "Clerk ↔ Supabase Third-Party Auth" section in `ARCHITECTURE.md`, including a verification checklist and the required env vars. One piece — the exact current dashboard label for adding the `publicMetadata` custom claim — could **not** be confirmed against either fetched docs page (only the `role: authenticated` claim was confirmed as auto-added by the integration); flagged explicitly in both files rather than presented with false confidence. Also created `.env.example` (names only, confirmed against both real `.env` files via a value-blind grep — `^[A-Z0-9_]+=` with `-o`, which prints the key and `=` but never what follows — so the real secrets were never read into this conversation at all).

### Task 2 — real wiring, and a rule conflict resolved by not building half of what was asked
`src/lib/data/propertyOwnership.ts` (new, `server-only`): `getOwnedProperty(token, tenantId)` fetches through Supabase PostgREST rather than Prisma, ordered by `created_at desc`, limited to 1. Wired into `/dashboard/property/page.tsx` (now an async Server Component, replacing `MOCK_OWNED_PROPERTY`), with an empty-state fallback since a real user may have no `property_ownerships` row yet — same defensive shape as `/dashboard/projects` already uses for the equivalent "no synced `users` row yet" case.

Unlike the Prisma path (`data/projects.ts`, where the app-level `tenantId` filter **is** the entire enforcement mechanism, since Prisma bypasses RLS), this path's `tenant_id` filter is genuinely redundant with the database: `property_ownerships_select`'s RLS policy already restricts rows to the caller's own tenant and Clerk identity, resolved from `token`'s own JWT — kept the explicit filter anyway, as defense-in-depth against a future RLS regression, and said so directly in the code comment rather than leaving the two enforcement models looking identical when they aren't.

**The request asked for both a Server Component and a Client Component (`useAuth()`) demonstration of this pattern. Only the Server Component was built.** `ARCHITECTURE.md`'s pre-existing "Frontend / Backend Separation" rule states plainly: *"The frontend never talks to Supabase... directly"* — a `"use client"` component constructing a `getSupabaseClient(token)` and querying Supabase from the browser is exactly what that rule forbids, independent of RLS still protecting the data at that point. Rather than ship code that violates a rule this same project enforces, or silently drop that half of the request, wrote out what the rejected pattern would look like and why, in `ARCHITECTURE.md`, so the decision is visible and reversible rather than either shipped quietly or dropped quietly.

Also documented, not changed: `getSupabaseClient` sends the Clerk token as a static `Authorization` header rather than supabase-js's now-documented `accessToken()` callback. Both reach the same request-level outcome here specifically because `getSupabaseClient` is already rebuilt fresh per request with an already-resolved token (the callback's refresh capability has nothing to do in that design) — not changed without a functional reason to change it.

### Task 3 — three requested test files, one added on top per this project's own testing rule
Wrote `src/lib/data/projects.test.ts`, `src/lib/supabaseClient.test.ts`, and `src/app/api/webhooks/clerk/route.test.ts` as requested, plus `src/lib/data/propertyOwnership.test.ts` for the new file from Task 2 — not asked for by name this round, but `CLAUDE.md`'s testing requirement applies to backend logic as it's written, not just to a named list, so it was added rather than left as a fourth "flagged, not done" item next to the three that already got closed this session.

**Two real bugs, both found only by actually running the suite, not by reading it back:**
1. `src/app/api/webhooks/clerk/route.test.ts`'s `vi.mock("svix", () => ({ Webhook: vi.fn().mockImplementation(() => ({ verify: verifyMock })) }))` referenced a plain `const verifyMock = vi.fn()` declared below it — `vi.mock()` factories hoist above ordinary `const`s, so the reference needed `vi.hoisted()` instead. Fixed, then re-ran: identical failures, unchanged. The hoisting fix was real but not sufficient — a second, unrelated bug was hiding behind it.
2. The actual cause: `afterEach(() => vi.restoreAllMocks())`, added for the `console.error` spy in each test, restores **every** `vi.fn()` in the file — including `Webhook`'s own `.mockImplementation()`, which is set up exactly once, in the `vi.mock()` factory, at module load. After the first test, every subsequent test saw `new Webhook(...)` return a bare, implementation-less mock; `.verify` on it threw; the route's `catch` block turned that into the same hardcoded `"Invalid signature"` 400 response every time — which is why several assertions that only checked `response.status === 400` passed for the wrong reason while nearby ones failed outright. Found by adding temporary diagnostic tests (removed once the fix landed) that isolated the mock, then the request, then a full `POST()` call with the `console.error` suppression turned off, at which point the restored/broken `Webhook` mock became visible. Fixed by capturing the `console.error` spy in its own variable and restoring only that one, leaving the module-level mocks alone.

### Coverage — one more stale exclusion caught, one narrowed properly this time instead of re-flagged
- `src/lib/supabaseClient.ts` was still on the coverage exclude list from the previous entry, added under "thin wiring, no branching logic." It now has a real test suite and a real conditional (`clerkToken ? {...} : undefined`) — removed from the exclude list rather than left stale.
- The previous entry's flagged-but-unfixed gap (`src/app/**` swallowing the webhook route's coverage along with actual thin pages) was fixed this time instead of flagged again: narrowed to `src/app/**/page.tsx` and `src/app/**/layout.tsx` specifically. Confirmed via `Glob` that no `loading.tsx`/`error.tsx`/custom `not-found.tsx` exist anywhere under `src/app` before narrowing, so nothing else slipped through unnoticed.
- Result: `route.ts` and `supabaseClient.ts` now both report 100%. `src/lib/auth/currentTenant.ts` remains at 0%, correctly still — it wasn't one of Task 3's three named files and wasn't modified this session, so backfilling its test wasn't pulled into this task's scope; carried forward, not silently dropped.

### Verification
`npm run test` → 64/64 passing (12 files; 33 new tests: 8 + 8 + 6 + 11). `npx tsc --noEmit` → clean. `npm run build` → clean, `/dashboard/property` now correctly `ƒ` dynamic (was `●` static), matching the same static→dynamic shift `/dashboard/projects` went through last entry, for the same reason. `npm run test:coverage` → 87.88%/94.4%/90.9%/87.88% aggregate (up from 79.73%/92.85%/82.6%/79.73%), with `route.ts` and `supabaseClient.ts` now visible and both at 100%.

- **Files touched:** `src/lib/data/propertyOwnership.ts` (created), `src/app/dashboard/property/page.tsx` (rewritten to async + real data), `supabase/migrations/0001_init.sql` (stale comment corrected), `ARCHITECTURE.md` (new "Clerk ↔ Supabase Third-Party Auth" section), `.env.example` (created), `vitest.config.ts` (`src/app/**` narrowed, `supabaseClient.ts` un-excluded), `src/lib/data/projects.test.ts`, `src/lib/data/propertyOwnership.test.ts`, `src/lib/supabaseClient.test.ts`, `src/app/api/webhooks/clerk/route.test.ts` (all created), `LOGS.md`.
- **Status:** Completed. Real, not-yet-done follow-ups: the actual Clerk/Supabase dashboard configuration itself (this entry documents the steps; nobody has clicked through them yet, so `getSupabaseClient` will still throw at runtime until `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are set); confirming the exact current dashboard label for the `publicMetadata` custom claim (flagged, not confirmed); a test for `src/lib/auth/currentTenant.ts`. Carried forward unchanged: replacing the fixed-tenant-id webhook bootstrap with real tenant provisioning, `RentalRoadmap.tsx`'s stage mismatch, `PropertyAssetCard`/`ProjectDetail` still untested, admin nav vocabulary, dark mode, missing admin screens in the source design, `afterSignOutUrl` deprecation cleanup, the still-missing `/dashboard/construction`/`/dashboard/visa` pages, and the Vitest 4/Next 16/Clerk 7 upgrade decision.

---

## 2026-07-19 — Bugfix: Per-User Tenant Provisioning, Webhook Recency Protection, and a Comprehensive Error Boundary

- **Type:** Bugfix
- **Summary:** Closed the three findings from the same-day validation audit that were classified as needing an actual fix rather than a documentation note: the single shared bootstrap tenant (audit finding 1.4, critical), out-of-order webhook delivery silently overwriting newer data (2.2), and the missing error boundary around the webhook's processing logic (2.5) — plus the case-sensitivity gap (2.4) bundled in since it touches the same function. All three files verified: `prisma validate`, `prisma generate`, `tsc --noEmit`, full test suite (76/76, up from 64), and `next build` all pass clean.

### Task 1 — real per-user tenant provisioning, replacing `DEFAULT_TENANT_ID`
The fixed, shared `Tenant` row is gone. A genuinely new Clerk user now gets their own `Tenant`, keyed on `crypto.randomUUID()` (the Web Crypto global, available in Node 20 without an import — confirmed it type-checks and resolves correctly at runtime rather than assumed), with `name: "User Tenant - ${clerkId}"`.

**Design decision beyond what was literally specified:** the request said to provision a tenant "when a `user.created` event arrives," but the actual branch condition used is "when no `User` row exists yet for this `clerkId`," regardless of which event type triggered it. This matters for the exact race this task is also trying to close (Task 2): if a `user.updated` event is ever delivered before its corresponding `user.created` (Clerk guarantees at-least-once delivery, not ordered delivery), gating strictly on `evt.type === "user.created"` would leave that out-of-order `user.updated` with no user row to update and no tenant to attach one to. Branching on "does the row exist" instead handles both orderings correctly with one code path, and still results in exactly one `Tenant` per Clerk user either way.

**Why an interactive transaction (`prisma.$transaction(async (tx) => ...)`), not the array form:** if two near-simultaneous deliveries for the same brand-new user both pass the "doesn't exist yet" check (a real TOCTOU window between the `findUnique` and the write), both would attempt `tx.user.create()`, and the second hits a primary-key conflict. With the interactive/callback form, that thrown error rolls back the *entire* transaction, including the `tx.tenant.create()` that already ran inside it — so the losing attempt leaves no orphaned `Tenant` row pointing at nothing. The array form doesn't give that rollback-together guarantee. The losing request's error propagates to the new outer try/catch (Task 2), returns a 500, and Clerk's retry succeeds against the now-existing row.

### Task 2 — recency protection, case-insensitive roles, and a real error boundary
- **Recency check:** `incomingEventTime` is read exactly as specified (`new Date(data.updated_at ?? Date.now())`). An existing user's stored `lastSyncedAt` (the *event's* timestamp, not Prisma's own `updatedAt` write-clock) is compared with `>=`, not `>` — deliberately, so this also catches an exact-duplicate redelivery of the same event, not just a genuinely older one. A `null` `lastSyncedAt` (pre-migration rows, or brand-new-in-this-request rows) is never treated as "stale" — there's nothing to compare against, so the update always proceeds.
- **Case-insensitive `resolveRole()`:** matches `"admin"`/`"ADMIN"`/`"Admin"`/any casing. Kept the original two-value behavior (ADMIN or TENANT only) — the request asked to make the existing check case-insensitive, not to add `Role.INVESTOR` resolution, so that wasn't added. `console.warn`s once for any *string* value that isn't recognized as admin or tenant, and separately for a value that isn't even a string (e.g. a stray number in `publicMetadata.role`) — but not for a simply absent/`null`/`undefined` role, since that's the normal "no role set" case, not a mistake.
- **Error boundary:** everything from the email-address lookup through both the update and the transaction branch is now inside one `try/catch`. Worth being precise about why this was a real gap, not just tidiness: `evt = ... as UserWebhookEvent` is a compile-time-only type assertion — svix verifies the payload's *signature*, never that its *shape* actually matches. A malformed payload or a transient DB error previously threw uncaught past the route handler, producing an opaque framework 500 with nothing logged. Now it's caught, logged via `console.error` with the actual error object, and returned as a clean, intentional 500 — telling Clerk to retry rather than giving up on a delivery that might succeed next time.

### Task 3 — schema + migration
`User.lastSyncedAt DateTime? @map("last_synced_at")` — nullable, no default: there's no real prior sync time to backfill for existing rows, and nullable is the semantically correct way to represent "never synced under this mechanism yet" rather than defaulting to a fabricated timestamp. `supabase/migrations/0003_add_webhook_metadata.sql` is a single `alter table ... add column if not exists` — safe on a non-empty table precisely because it stays nullable, unlike the two-step backfill-then-`NOT NULL` pattern `0002_api_key_sync.sql` needed for columns that couldn't stay nullable.

### Test suite — substantially rewritten, not just patched
The old suite's assumptions (a shared `DEFAULT_TENANT_ID`, `prisma.tenant.upsert`/`prisma.user.upsert` as the only DB calls) no longer match the code, so the mocks changed shape entirely: `prisma.user.findUnique`/`update` and `prisma.$transaction` (with a callback implementation that actually invokes the passed function against mocked `tx.tenant.create`/`tx.user.create`, so assertions can inspect what the transaction body did) replace the old upsert mocks. `crypto.randomUUID` is spied and pinned to a fixed value so the generated tenant id is assertable rather than only pattern-matched. New coverage: brand-new-user provisioning (including the concurrent-race rollback path, by making the mocked transaction reject and asserting a clean 500), update-vs-skip for both an older and an exactly-equal `lastSyncedAt`, a pre-migration `null` `lastSyncedAt` still processing normally, four-casing admin resolution, a non-string role value, and two error-boundary paths (the lookup throwing, the update throwing). Initial coverage run showed one branch in `resolveRole` genuinely unexercised (the "role present but not a string" warning path) — added the one test needed to close it rather than leave a known gap in code written this same session; `route.ts` now reports 100%/97.29%/100%/100%.

- **Files touched:** `src/app/api/webhooks/clerk/route.ts` (rewritten), `src/app/api/webhooks/clerk/route.test.ts` (rewritten), `prisma/schema.prisma` (`User.lastSyncedAt` added), `supabase/migrations/0003_add_webhook_metadata.sql` (created), `generated/prisma/**` (regenerated), `LOGS.md`.
- **Status:** Completed. Real, not-yet-done follow-ups: this only fixes tenant-per-*signup*, not organization-based multi-user tenants — there's still no flow for multiple users to land in the same tenant on purpose (Clerk Organizations was the suggested direction in the audit, not built here, since it wasn't asked for this round); no data migration was written for any pre-existing rows that might already reference the now-removed fixed bootstrap tenant id, since nothing has been deployed against a real database yet. Carried forward unchanged from the audit: no runtime shape validation on Supabase-returned rows beyond `status` (audit finding 3.3), a test for `src/lib/auth/currentTenant.ts`, `RentalRoadmap.tsx`'s stage mismatch, `PropertyAssetCard`/`ProjectDetail` still untested, and the actual Clerk/Supabase dashboard configuration (still nobody's clicked through it).

---

## 2026-07-19 — Feature: Production Data-Access Layers for EncryptedApiKey and PaymentLedger

- **Type:** Feature
- **Summary:** Built the two data-access modules the project has been missing since the schema was first written: `src/lib/data/apiKeys.ts` (BYOK key management, real AES-256-GCM encryption) and `src/lib/data/ledgers.ts` (payment installment tracking, including a real partial-payment engine that didn't exist before this entry). One request/schema conflict was resolved with the user before writing any code, rather than guessed at. All verified: `prisma validate`, `prisma generate`, `tsc --noEmit`, full test suite (110/110, up from 76), and `next build` all pass clean; both new modules report 100%/100%/100%/100% coverage.

### Blocking conflict resolved with the user: EncryptedApiKey has no userId column
The request asked every function to filter by both `tenantId` and `userId` "to ensure a compromised key or tenant context cannot leak metadata to another organization." But `EncryptedApiKey` was given no user-level relation at all two entries ago, with an explicit comment: *"there is no relation to User here to 'keep' — there never was one... BYOK keys are tenant-level shared credentials, not per-user."* Silently adding a `userId` column would reverse that documented decision; silently dropping the security requirement instead wouldn't honor what was explicitly asked for as security-critical. Asked directly rather than pick a side: confirmed answer is to keep keys tenant-shared, with `userId` accepted by every function for logging/attribution only — not part of the actual tenant-isolation filter, since there's no column for it. No schema change needed for this part.

### Task 1 — `src/lib/data/apiKeys.ts`
- **Encryption:** AES-256-GCM via Node's built-in `crypto`, key read from a new `API_KEY_ENCRYPTION_SECRET` env var (base64, must decode to exactly 32 bytes — checked and thrown on explicitly, not assumed). The schema has `encryptedKey`/`encryptionIv` columns but none for GCM's required authentication tag; rather than adding a column, the tag is appended to `encryptedKey` as `<base64 ciphertext>.<base64 authTag>` — documented inline, since both pieces are meaningless without each other and this is the reason they're stored as one string, not two.
- **Masking:** the task's own example format ("nk-...xxxx") was not used. `ApiKeyCard.tsx` already exists, already has its own tested mock and doc comment showing `"sk-ant-••••••••••••wq7A"` (real prefix + bullets + last 4 real characters) — matching what's already shipped and tested beat introducing a second, conflicting masked-key convention the component was never built to expect.
- **Status casing:** Prisma's `ApiKeyStatus` is uppercase (`ACTIVE`/`REVOKED`); `ApiKeyCard.tsx`'s own frontend type is lowercase (`"active"`/`"revoked"`) — the exact same category of mismatch as the Clerk `publicMetadata.role` casing gap fixed two entries ago, just on a different field. An explicit mapping function handles it at the data-layer boundary, same pattern as `toFrontendStatus` in `projects.ts`.
- **`provider` added to `createTenantApiKey`'s signature**, beyond the four parameters literally listed: `EncryptedApiKey.provider` is a required column with no sensible default, so the function could not have inserted a valid row without it.
- **`revokeTenantApiKey`'s "fail silently or throw" instruction was ambiguous** (the two are opposites) — implemented as throw: a tenantId/apiKeyId combination that don't actually belong together is a bug worth surfacing, not one worth hiding. Uses `updateMany({ where: { id, tenantId } })` + a `count === 0` check specifically so `id` and `tenantId` combine in one atomic filter, rather than a separate existence check racing against the update.
- **Not built, flagged rather than assumed:** a decrypt path. None of the three requested functions need to return the real secret (`getTenantApiKeys` returns the masked view only), so nothing here can decrypt what it just encrypted — that belongs with whatever code actually calls the provider API later.

### Task 2 — `src/lib/data/ledgers.ts`
- **`isDelayed` is computed fresh on every read**, never trusted from the row's own stored `is_delayed` column, exactly as specified — a PENDING installment becomes delayed the instant its due date passes with no batch job required. Tested explicitly with a row whose stored column says the opposite of the computed answer, to prove the override actually happens rather than coincidentally matching.
- **Partial payments required a schema addition:** `PaymentLedger.amount`/`status` (PENDING/PAID/OVERDUE) can only represent "fully paid or not" — there is no field for "amount paid so far." Added `amountPaid Float @default(0)`, the same category of necessary addition as `lastSyncedAt` two entries ago, flagged the same way rather than silently introduced. `supabase/migrations/0004_payment_ledger_partial_payments.sql` adds it `NOT NULL DEFAULT 0` in one step — safe here specifically because, unlike `lastSyncedAt`, every existing row genuinely has a correct real value ("zero paid so far") to default to.
- **Overpayment is rejected, not silently credited:** a payment that would push the cumulative total past the installment's full `amount` throws, since this schema has no refund/credit mechanism to apply the excess to — accepting it would just produce an unexplained balance.
- **`recordTenantPayment` runs inside one interactive transaction**, where a single `findFirst({ where: { id, tenantId } })` (mirroring `getProjectById`'s exact pattern in `projects.ts`) is the one authoritative tenant-ownership check; the subsequent `update` doesn't need to repeat the `tenantId` filter because nothing else can change the row's tenant between the two within the same transaction.

### Task 3 — `tests/data/businessMetrics.test.ts`
Built at the exact path and combined-file shape requested, which departs from this project's established convention (co-located `src/lib/**/*.test.ts`, one file per module) — flagged rather than silently moved to match precedent, since the path was explicit. Mock lifecycle follows the contract this task itself asked for: every mock is either freshly `.mockReset()` in `beforeEach` or a one-time `.mockResolvedValueOnce()`/`.mockImplementationOnce()` that self-expires; nothing calls `vi.restoreAllMocks()`/`vi.resetAllMocks()`, for the exact reason documented in the Clerk webhook route's test suite two entries ago. Explicit mismatched-tenant assertions exist for every mutation (`revokeTenantApiKey` and `recordTenantPayment` both get a dedicated "belongs to a different tenant → mutation dropped, error thrown" test) and every read (`getTenantApiKeys`/`getTenantLedger` both assert the query's `where` clause never contains a second tenant's id). Encryption itself is not mocked — a real, valid 32-byte test key is stubbed via `vi.stubEnv`, so "the persisted `encryptedKey` is not the raw secret" is a genuine assertion, not a tautology against a fake. Initial coverage run found two real gaps in freshly-written code (the "role/key too short to mask normally" branch, and — from the webhook entry's carryover — nothing new there) — closed with one added test rather than left; both modules now report 100%/100%/100%/100%.

- **Files touched:** `src/lib/data/apiKeys.ts` (created), `src/lib/data/ledgers.ts` (created), `tests/data/businessMetrics.test.ts` (created), `prisma/schema.prisma` (`PaymentLedger.amountPaid` added), `supabase/migrations/0004_payment_ledger_partial_payments.sql` (created), `.env.example` (`API_KEY_ENCRYPTION_SECRET` added), `generated/prisma/**` (regenerated), `LOGS.md`.
- **Status:** Completed. Real, not-yet-done follow-ups: neither module is wired into any page yet (`settings`/`payments` pages still render their original mock data — only the backend layer was requested this round); no decrypt path exists for actually using a stored API key against a provider; `ApiKeyCard.tsx` displays human-formatted dates ("3 May 2026") but this layer returns ISO strings, matching `projects.ts`'s established convention — wiring a real page will need to reconcile that. Carried forward unchanged: organization-based multi-user tenants, a test for `currentTenant.ts`, `RentalRoadmap.tsx`'s stage mismatch, `PropertyAssetCard`/`ProjectDetail` still untested, and the Clerk/Supabase dashboard configuration.

---

## 2026-07-19 — Bugfix/Feature: Closing the Remaining Audit Gap, Wiring Everything to Real Data, and the Last Untested Files

- **Type:** Bugfix
- **Summary:** Worked through everything left open across the audit and prior entries in one pass: the one still-unfixed audit finding (3.3), a decrypt path for the API-key encryption built last entry, real data wired into `/dashboard/rental`, `/settings`, and `/dashboard/payments` (all three previously still on hardcoded mock props), `RentalRoadmap.tsx`'s long-flagged stage mismatch, a real Clerk deprecation, and tests for every remaining untested file. One near-miss caught before it shipped: reusing `getTenantLedger()` (deliberately tenant-wide, built two entries ago) for the new personal payments page would have leaked every other tenant member's payment history onto one user's own page — built a properly-scoped sibling instead. All verified: `prisma validate`, `prisma generate`, `tsc --noEmit`, full suite (152/152, up from 110), and `next build` all pass clean — coverage is 100% statements/functions/lines across every single file in the project, 97.84% branches.

### Audit finding 3.3 — closed
`propertyOwnership.ts`'s `toProject()` now runs `assertValidPropertyRow()` first, checking every required string/number field's actual runtime type before mapping — a `NULL` or wrong-typed column (unreachable through this app's own code today since every column is `NOT NULL`, but not something the type system prevents at this Supabase-generics-are-compile-time-only boundary) now throws a clear, traceable error here instead of silently producing a `Project` with a `null` that only breaks later inside a component's render. Five new tests, including one confirming a well-formed row still passes through untouched.

### Decrypt path for `apiKeys.ts`
Added `getDecryptedApiKey(tenantId, apiKeyId)` — the one function in the module that ever returns raw key material, scoped to `status: ACTIVE` as well as `tenantId` (a revoked key must never become usable again just because its ciphertext still exists in the row), and it updates `lastUsedAt` on success (best-effort — a tracking-write failure is logged and swallowed, never allowed to block the caller from getting the key they asked for). Tested via a genuine round-trip: `createTenantApiKey()`'s real encryption output is fed straight into `getDecryptedApiKey()`'s real decryption, asserting the exact original secret comes back — not a hand-built fixture, which `encryptKeyMaterial()` being private couldn't have produced anyway.

### Wiring real data into three pages that were still on mocks
- **`/dashboard/rental`**: `RentalRoadmap.tsx` previously read `rentalStageIndex` from Clerk's `publicMetadata` and rendered 10 labels ("Project Delivered" ... "Property Leased") that never matched `prisma/schema.prisma`'s real `RentalStage` enum — flagged as a known mismatch across several prior entries, never fixed until now. Converted it to a plain presentational component (no more `"use client"`, no more Clerk dependency at all) taking a `currentStage: RentalStage` prop, with 10 labels that are honest human-readable versions of the real enum values. Added `getCurrentRentalStage(token, tenantId)` to `propertyOwnership.ts` (same table, RLS policy, and tenant-scoping reasoning as `getOwnedProperty()`, just selecting `rental_stage` instead of the joined property) to actually supply it.
- **`/settings`**: now fetches real keys via `getTenantApiKeys()` and renders one `ApiKeyCard` per key. Revoke is now a real, working `"use server"` action (`src/app/settings/actions.ts`) passed directly as `ApiKeyCard`'s `onRevoke` prop — Next.js allows binding a Server Action straight into a Client Component's callback prop this way. The action re-resolves `tenantId`/`userId` itself, server-side, rather than trusting anything the client could supply, and calls `revalidatePath("/settings")` after a successful revoke. **Deliberately not wired:** "Rotate key" and adding a new key both need raw key-material input UI that doesn't exist in `ApiKeyCard.tsx` today — building that would be a new feature, not finishing an existing one, so both stayed exactly as unwired as before.
- **`/dashboard/payments`**: this is where the near-miss happened. `getTenantLedger(tenantId)` was built two entries ago *deliberately* tenant-wide with no `userId` param, matching that task's literal spec for an admin-style "every installment" view. Using it for this personal, single-client payments page would have shown every other tenant member's payment history on one user's own page — a real data-exposure bug, not a hypothetical one, given `PaymentLedger.userId` already exists as a real column. Added `getUserLedger(tenantId, userId)` as the properly-scoped sibling and used that instead; `getTenantLedger()` itself is untouched, still correct for whatever admin view eventually calls it. The page renders one `DelayPenalty` per installment with a plain due-date/amount heading — no new reusable component invented, since a full ledger-table component wasn't asked for.

### `afterSignOutUrl` deprecation — verified before fixing, not assumed
Checked Clerk's current docs and the actual PR that deprecated it (github.com/clerk/javascript/pull/3544) before touching anything, given this project already found one stale, never-verified assumption this session (the JWT Template comment, corrected two entries ago). Confirmed real: moved from `<UserButton afterSignOutUrl="/">` (Sidebar.tsx) to `<ClerkProvider afterSignOutUrl="/">` (layout.tsx).

### Tests for every remaining untested file
`currentTenant.ts`, `PropertyAssetCard.tsx`, `ProjectDetail.tsx`, the new `revokeApiKeyAction`, `getCurrentRentalStage`, `getDecryptedApiKey`, and `getUserLedger` all now have suites. `ProjectDetail.test.tsx` reads each spec row's value through its `<dt>`'s DOM sibling rather than `screen.getByText(value)` — some values (an area name) can also appear as a substring inside the address link rendered elsewhere on the same page, and matching through the DOM relationship sidesteps that ambiguity rather than relying on exact-text-node matching working out by luck.

### Verification
`npx prisma validate` clean → `npx prisma generate` (regenerated, no schema changes this entry) → `npx tsc --noEmit` clean → `npm run test` 152/152 (17 files, up from 13) → `npm run build` clean, `/dashboard/rental`, `/settings`, and `/dashboard/payments` now correctly `ƒ` dynamic (all three were static before) → `npm run test:coverage`: **100% statements/functions/lines across every file in the project**, 97.84% branches. The two remaining branch gaps (`projects.ts` 87.5%, `propertyOwnership.ts` 96.15%) are the same pre-existing `toFrontendStatus` exhaustive-switch pattern in both files, not introduced this entry — left alone rather than padded with trivial per-enum-value tests unrelated to what was actually being fixed.

- **Files touched:** `src/lib/data/propertyOwnership.ts` (row validation + `getCurrentRentalStage` added), `src/lib/data/apiKeys.ts` (`decryptKeyMaterial`/`getDecryptedApiKey` added), `src/lib/data/ledgers.ts` (`getUserLedger` added), `src/components/ui/RentalRoadmap.tsx` (rewritten, prop-driven), `src/app/dashboard/rental/page.tsx`, `src/app/settings/page.tsx`, `src/app/dashboard/payments/page.tsx` (all rewired to real data), `src/app/settings/actions.ts` (created), `src/app/layout.tsx`, `src/components/ui/Sidebar.tsx` (`afterSignOutUrl` moved), `src/lib/auth/currentTenant.test.ts`, `src/app/settings/actions.test.ts`, `src/__tests__/components/PropertyAssetCard.test.tsx`, `src/__tests__/components/ProjectDetail.test.tsx` (all created), `src/__tests__/components/RentalRoadmap.test.tsx`, `src/__tests__/components/Sidebar.test.tsx`, `src/lib/data/propertyOwnership.test.ts`, `tests/data/businessMetrics.test.ts` (all updated), `LOGS.md`.
- **Status:** Completed. Real, not-yet-done items, deliberately not attempted this entry (flagged to the user directly, not silently skipped): brand-new `/dashboard/construction` and `/dashboard/visa` pages (a real frontend spec exists in `FRONTEND_SPEC.md`, but no backend schema at all exists for milestones/visa steps — building these for real is a full new-feature undertaking, not a fix); organization-based multi-user tenants; admin-specific navigation (no spec exists for what an admin should see); the dark mode decision; the Vitest 4/Next 16/Clerk 7 upgrade; a real git remote URL; and the actual Clerk/Supabase dashboard configuration (still nobody's clicked through it).

---

## 2026-07-21 — Feature: Construction Milestones & Golden Visa Data Layer, Production Deploy Checklist

- **Type:** Feature
- **Summary:** Added the database models, migration, and data-access layer backing the `/dashboard/construction` and `/dashboard/visa` screens specified in `FRONTEND_SPEC.md` (`ConstructionMilestone`, `VisaStep`), plus a new `ENVIRONMENT_DEPLOY.md` ops runbook. The pages themselves were not requested this round and were not built — only the backing layers. All verified: `prisma validate`, `prisma generate`, `tsc --noEmit`, full suite (162/162, up from 152), and `next build` all pass clean; both new data-layer files report 100%/100%/100%/100% coverage.

### Schema deviations from the literal request, flagged rather than silently applied
- **Migration renumbered 0004 → 0005:** the request named `0004_construction_and_visa.sql`, but `0004` was already taken by last entry's `0004_payment_ledger_partial_payments.sql`. Numbered `0005` to continue the real sequence on disk.
- **`tenantId` added to `ConstructionMilestone`**, though only `propertyId` was in the original field list: `ARCHITECTURE.md`'s multi-tenancy mandate ("every table needs tenant_id") is a standing project-wide rule, and `PropertyOwnership`/`PaymentLedger` already set the precedent of storing `tenantId` redundantly alongside a `propertyId` FK for the same reason. `getPropertyMilestones()` still does the requested "verify the property belongs to this tenant" check against `Property` directly; the new column makes that guarantee enforceable at the RLS layer too, and lets the milestones query itself re-filter by `tenantId` as defense in depth.
- **`@@unique([userId, stepOrder])` added to `VisaStep`**, mirroring `PropertyOwnership`'s own `@@unique([userId, propertyId])` precedent — two rows both claiming to be the same user's "step 3" is a data integrity bug worth preventing outright, not left to application code.
- **Status columns use `text ... check (...)`, not a native Postgres `create type ... as enum`**, despite the request's Task 1 wording — matches every other enumerated column in this schema (`role`, `properties.status`, `payment_ledger.status`, `rental_stage`), all of which made the same choice already, and avoids introducing a second, differently-behaved enum mechanism (native enums restrict `ALTER TYPE ... ADD VALUE` from running inside the same transaction as other DDL/DML).
- **`@db.Date` applied to `targetDate`/`completionDate`** (calendar dates, matching `deliveryDate`/`contractDate`'s existing treatment) but **not to `VisaStep.completedAt`** (a specific moment, matching `lastUsedAt`/`lastSyncedAt`'s existing treatment) — decided from the `*Date` vs. `*At` naming convention already implicit across the rest of the schema, rather than guessed independently for each field.

### Task 2 — `src/lib/data/construction.ts` / `src/lib/data/visa.ts`
- **`getPropertyMilestones(tenantId, propertyId)`** looks up the property scoped to `tenantId` first (`select: { id: true }` only — nothing else is needed) and returns `[]` immediately, without ever querying milestones, if it isn't found. A property that exists but belongs to a different tenant is indistinguishable from one that doesn't exist at all, matching `getOwnedProperty()`/`getDecryptedApiKey()`'s established convention. The milestones query itself still repeats `tenantId` in its own `where` clause, the same belt-and-suspenders pattern `recordTenantPayment()` uses inside its transaction.
- **`getUserVisaSteps(tenantId, userId)`** is a direct `where: { tenantId, userId }` filter, no intermediate lookup needed — `VisaStep` already carries both columns directly, the same shape as `getUserLedger()`.

### Task 3 — `tests/data/constructionAndVisa.test.ts`
Built at the explicit combined-file path requested, the same departure from this project's co-located-test convention as `businessMetrics.test.ts`, for the same reason (path was explicit). 10 tests: beyond mapping/null-branch coverage for both modules, each function has a dedicated assertion on the *exact* `where`-clause shape passed to Prisma (`{ id, tenantId }` for the property check, `{ propertyId, tenantId }` for the milestones query, `{ tenantId, userId }` for visa steps) — since a mock can't simulate real cross-tenant data leakage on its own, asserting the call args directly is what would actually catch a regression that silently dropped a tenant filter. Both new files report 100%/100%/100%/100% coverage.

### Task 4 — `ENVIRONMENT_DEPLOY.md`
Documents the real migration pipeline, not the literal `npx prisma migrate deploy` the request offered as one option: checked `prisma.config.ts` directly and found it points at a `prisma/migrations` directory that doesn't exist anywhere in this repo — this project's actual source of truth is handwritten SQL under `supabase/migrations/`, applied in strict numeric order, with `prisma generate` run separately purely to keep the generated client's types in sync. Also flagged that `supabase/config.toml`, referenced by `ARCHITECTURE.md`'s local-dev instructions, doesn't exist in the repo yet either — noted as something to actually create, not assumed already present.

### Verification
`npx prisma validate` clean → `npx prisma generate` (new models present in `generated/prisma/`) → `npx tsc --noEmit` clean → `npm run test` 162/162 (18 files, up from 152/17) → `npm run test:coverage`: `construction.ts`/`visa.ts` both 100%/100%/100%/100% → `npm run build` clean (no `/dashboard/construction` or `/dashboard/visa` routes appear in the build output — correctly, since no pages were requested this round, only the layers behind them).

- **Files touched:** `prisma/schema.prisma` (`MilestoneStatus` enum, `ConstructionMilestone`/`VisaStep` models, relation arrays on `Tenant`/`Property`/`User` added), `supabase/migrations/0005_construction_and_visa.sql` (created), `src/lib/data/construction.ts` (created), `src/lib/data/visa.ts` (created), `tests/data/constructionAndVisa.test.ts` (created), `ENVIRONMENT_DEPLOY.md` (created), `generated/prisma/**` (regenerated), `LOGS.md`.
- **Status:** Completed for what was asked (schema, migration, data-access layer, tests, deploy doc). Not attempted, flagged rather than silently skipped: the actual `/dashboard/construction`/`/dashboard/visa` page components and the new presentational pieces `FRONTEND_SPEC.md` calls for (`MilestoneRow`, `UpdateCard`, `DocumentRow`, `TimelineStep`, `DocumentChecklistRow`) — none exist yet, this entry is backend plumbing only; actually running `0005_construction_and_visa.sql` against a real database; actually clicking through the dashboard/environment-variable steps `ENVIRONMENT_DEPLOY.md` now documents.

---

## 2026-07-21 — Feature: Construction & Golden Visa Dashboard Pages

- **Type:** Feature
- **Summary:** Built the actual `/dashboard/construction` and `/dashboard/visa` pages on top of last entry's data layer — the two presentational components `FRONTEND_SPEC.md` calls for that are backed by real data (`ConstructionMilestones`, `VisaTimeline`), wired into new Server Component pages. Also made the first-ever commits for this project: everything from this session through last entry's data layer landed in one commit, and this entry's UI work in a second, clean commit — both file sets happened to split perfectly along "brand-new files only" lines, so no history had to be reconstructed by hand. All verified: `tsc --noEmit`, full suite (172/172, up from 162), and `next build` all pass clean; both new components report 100%/100%/100%/100% coverage.

### Scope: only the pieces with real data behind them
`FRONTEND_SPEC.md`'s Construction screen also calls for `UpdateCard` (photo/video updates) and `DocumentRow` (site documents); its GoldenVisa screen also calls for `DocumentChecklistRow`. None of these were built — there is no schema/table for documents or photo updates anywhere in this project, and inventing one now (plus the file storage a real version would need) is a substantially bigger undertaking than "wire the pages that already have a data layer." Building them today would have meant either hardcoded mock arrays (contradicting this session's own throughline of replacing mocks with real data) or a scope-creeping new feature nobody asked for.

### `ConstructionMilestones` vs. `VisaTimeline` — two different visual shapes for two different data shapes
`ConstructionMilestone` rows carry their own independent status each (no single "current milestone" concept), so `ConstructionMilestones` renders a plain list with a per-row status dot/badge, plus a genuinely computed overall-progress bar (`completedCount / total`, not a fabricated per-milestone `pct` — `FRONTEND_SPEC.md`'s mock shape (`{ label, pct, status }`) assumes a number this schema doesn't have). `VisaStep` rows are a true ordered sequence (`stepOrder`), so `VisaTimeline` reuses `RentalRoadmap`'s connector-stepper visual — numbered circles joined by a line — but reads each step's own status directly rather than deriving it from a single current-index comparison the way `RentalRoadmap` does, since `VisaStep`, unlike `RentalStage`, has no single "current stage" scalar to compare against.

### A real locale bug caught by the test suite itself
First test run failed on `getByText("Completed 5 Sep 2026")` — not a component bug. `Intl.DateTimeFormat("en-GB", { month: "short" })` renders September as **"Sept"** (4 letters); every other month in the calendar abbreviates to 3. Confirmed directly (`Intl.DateTimeFormat` output for all 12 months) before touching anything, rather than assumed. Fixed the test fixture, not the component — the component's formatting is correct and consistent with every other date display already in this codebase.

### First commits for this project
`git status` showed the entire session's backend work — going back to the original Clerk/Supabase/Prisma bridge — sitting uncommitted with `origin` already correctly pointed at this project's GitHub remote but nothing ever pushed. Split into two commits rather than one: everything through last entry's data layer (53 files, the schema/RLS/webhook/BYOK/ledger/data-layer work plus every page it wired) in the first commit, and this entry's 6 brand-new UI files (2 components, 2 pages, 2 tests) in a second. The split was possible with plain file-level `git add`, no hunk-splitting needed, because this entry touched only new files and never modified anything the first commit already covered.

### Verification
`npx tsc --noEmit` clean → `npm run test` 172/172 (20 files, up from 162/18 — one real failure found and fixed along the way, the `en-GB`/"Sept" issue above) → `npm run test:coverage`: `ConstructionMilestones.tsx`/`VisaTimeline.tsx` both 100%/100%/100%/100% (the project-wide 98.07% branch figure is unchanged pre-existing debt in files this entry never touched: `route.ts`, `ApiKeyCard.tsx`, `TopNav.tsx`, `projects.ts`, `propertyOwnership.ts`) → `npm run build` clean, `/dashboard/construction` and `/dashboard/visa` now real routes, both correctly `ƒ` dynamic.

- **Files touched:** `src/components/ui/ConstructionMilestones.tsx` (created), `src/components/ui/VisaTimeline.tsx` (created), `src/app/dashboard/construction/page.tsx` (created), `src/app/dashboard/visa/page.tsx` (created), `src/__tests__/components/ConstructionMilestones.test.tsx` (created), `src/__tests__/components/VisaTimeline.test.tsx` (created), `LOGS.md`.
- **Status:** Completed for what was in scope. Not attempted, flagged rather than silently skipped: `UpdateCard`/`DocumentRow`/`DocumentChecklistRow` and the documents/photo-updates feature they'd need behind them; actually pushing the two new commits to `origin` (committed locally only — pushing is a shared/visible action, left for explicit go-ahead); applying `0005_construction_and_visa.sql` to a real database, so both new pages currently show their empty state against any real Supabase project; and everything else already carried forward unchanged (organization multi-tenancy, admin navigation, dark mode, the Next 16/Vitest 4/Clerk 7 upgrade, the Clerk/Supabase dashboard clickthroughs).

---

## 2026-07-23 — Feature: Role-Based Overview, Real Notifications, Live Test Accounts, and a Critical Prisma/Postgres Enum Bug

- **Type:** Feature + Bugfix
- **Summary:** Built the admin/client split for Overview, a real notifications system end to end, and created the two live Clerk accounts requested (one admin, one demo client) with seeded demo data. In the process of verifying the new admin client list against the *real* database — not mocks — discovered and fixed a serious, previously invisible bug: every Prisma query anywhere in this project that filters or writes an enum-typed column (`Role`, `PaymentStatus`, `ApiKeyStatus`) has been silently broken against a real Postgres connection since the moment those functions were first written, several entries ago. All verified: `tsc --noEmit`, full suite (213/213, up from 210), and `next build` all pass clean; every file touched this entry is at 100% coverage; the fix itself was independently re-verified with live queries against Postgres, not just mocks.

### The bug: Prisma `enum` fields require a native Postgres enum type that never existed
`getTenantClients()` (built this entry) was the first Prisma-path query in the whole project to filter directly on `role: Role.TENANT` against a live database rather than a mock. It failed immediately: `DriverAdapterError: type "public.Role" does not exist`. Investigated rather than patched around: Prisma 7's `"prisma-client"` generator, used with `@prisma/adapter-pg`, casts any parameter bound to a Prisma-schema `enum` field as `$1::"EnumName"` unconditionally — regardless of whether the database actually has a matching native type. Every migration in this project (`0001_init.sql` onward) deliberately used `text + check` instead of `create type ... as enum`, explicitly to stay consistent across the whole schema and avoid `ALTER TYPE`'s transaction restrictions — a reasonable, well-documented choice at the time, but one nobody had verified against a live enum-filtered query until today. Confirmed via a live isolation test that this affects **any** enum-typed filter or write, not just `Role`: `ApiKeyStatus` failed identically. Confirmed via web search that this is a known, community-documented Prisma limitation with the practical fix being exactly what was applied: change the Prisma field type from `enum` to `String`.

This means `getDecryptedApiKey()`, `revokeTenantApiKey()`, and `recordTenantPayment()` — all built and "verified" in earlier entries — have never actually worked against a real database; every test suite for them stayed green throughout because mocked Prisma clients can't catch a live-connection-only failure. This was invisible until this entry's live-database testing.

**Fixed:** `Role`, `PaymentStatus`, `ApiKeyStatus` are now Prisma `String` fields, not `enum` blocks (schema-only change — the actual Postgres columns were already `text + check`, so no new migration was needed). Each Prisma-generated enum export was replaced with a plain local const of the same shape, so every `Role.ADMIN`/`PaymentStatus.PAID`/`PrismaApiKeyStatus.ACTIVE` call site kept working unchanged — only the import source moved (`src/lib/auth/role.ts` for `Role`; a local const in `apiKeys.ts`/`ledgers.ts` for the other two). Every place that previously got a free, Prisma-narrowed union type when reading these columns back now runs through an explicit validator (`toRole`, `toFrontendStatus`'s new default branch, new `toLedgerStatus`) that throws on an unrecognized value instead of silently mistyping the row.

**Deliberately not fixed, flagged instead:** `PropertyStatus`, `RentalStage`, `AiLogStatus`, `MilestoneStatus` are the same latent bug class — none of them have a native Postgres enum type either — but none of them are currently filtered or written through Prisma by any shipped function, so they aren't live-broken today. The moment any future code does (an admin mutation on rental stage or milestone status, a real `ai_logs` write), it will fail exactly the same way and need the identical treatment. Left alone this entry to bound the blast radius of an already-large change; noted here so it isn't rediscovered from scratch.

### Task: role-based Overview
Overview now genuinely branches instead of always rendering the same hardcoded `ClientTable`: an `ADMIN` sees a real client table (`getTenantClients()`, new) with each row's "View" — previously a dead `onClick` calling a prop nobody ever passed — now a real `Link` to a new `/dashboard/clients/[userId]` admin-only detail page; a `TENANT` sees `ClientOverviewSummary` (new), the same "roll up every other page" component reused on both the admin drill-down and a client's own Overview. Building this required a Prisma-path counterpart to the Supabase-only `getOwnedProperty()`/`getCurrentRentalStage()`: `getClientPropertySnapshot()`, since an admin viewing *another* client's data has no token representing that other user and RLS could never grant it anyway.

### Task: real notifications
Added a `Notification` model (deliberately minimal: message + read flag, no type/link taxonomy — nothing in this app yet has more than one kind of event worth notifying on). The bell in `TopNav` had no `onClick` at all before this entry; it's now a real dropdown backed by `getUserNotifications()`/`markNotificationRead()`, wired via one shared Server Action (`src/app/actions/notifications.ts`) reused across every page rather than duplicated per directory. The one automatic trigger wired up: `recordTenantPayment()` now creates a notification in the *same transaction* as the payment write, so the two are atomic. No other mutation exists yet to hook a second automatic trigger into without inventing a business event nobody asked for.

### Task: real Clerk accounts + demo data
Created via the Clerk Backend API (`clerkClient.users.createUser`/`updateUser`, `skipPasswordChecks: true`): `n.themis2000@yahoo.gr` as admin (already existed in Clerk from earlier testing — updated its role and password rather than failing on a duplicate-email error) and `themisnik7@gmail.com` as a fresh demo client. Since the Clerk webhook cannot reach `localhost` to sync either account into Postgres, both `Tenant`/`User` rows were provisioned by hand, matching the webhook's own insert shape exactly, into **one shared tenant** — a deliberate, flagged deviation from the standing one-tenant-per-signup rule, made only for these two manually-provisioned accounts (not a change to the webhook's own provisioning logic), because the requested admin/client feature is structurally impossible to demo otherwise: today's real signup flow gives every user their own isolated tenant, so there is still no way for two *webhook-driven* signups to end up seeing each other. Seeded one property, one ownership row, three payment installments, five construction milestones, five visa steps, and two notifications for the demo client so the account has real, non-empty data to check features against.

### Verification
`npx tsc --noEmit` clean → `npm run test` 213/213 (24 files, up from 210/24 before the enum fix's own new tests) → `npm run test:coverage`: every file touched this entry at 100%, project-wide 98.8% branch (unchanged pre-existing gaps only) → `npm run build` clean, `/dashboard` and `/dashboard/clients/[userId]` both correctly `ƒ` dynamic → independently re-ran live (non-mocked) queries against the connected Postgres database covering every previously-broken path (the `Role`-filtered client list, an `ApiKeyStatus`-filtered lookup, and a `PaymentStatus` write), all passing after the fix, none before it.

- **Files touched:** `prisma/schema.prisma` (`Notification` model, `User.firstName`/`lastName`, `Role`/`PaymentStatus`/`ApiKeyStatus` converted from `enum` to `String`), `supabase/migrations/0006_notifications_and_user_name.sql` (created), `src/lib/auth/role.ts` (created), `src/lib/auth/currentTenant.ts` (`getCurrentUser` added), `src/lib/data/clients.ts` (created), `src/lib/data/notifications.ts` (created), `src/lib/data/propertyOwnership.ts` (`getClientPropertySnapshot` added), `src/lib/data/apiKeys.ts`, `src/lib/data/ledgers.ts` (enum fix + notification trigger), `src/lib/data/projects.ts` (`toProject` exported), `src/app/api/webhooks/clerk/route.ts` (name sync + enum fix), `src/app/actions/notifications.ts` (created), `src/components/ui/ClientOverviewSummary.tsx` (created), `src/components/ui/ClientTable.tsx` (real link, dead prop removed), `src/components/ui/TopNav.tsx` (real notifications dropdown), `src/app/dashboard/page.tsx` (role branch), `src/app/dashboard/clients/[userId]/page.tsx` (created), every other dashboard/settings page (real identity + notifications wiring), all corresponding test files, `LOGS.md`.
- **Status:** Completed for what was asked. Not attempted, flagged rather than silently skipped: converting `PropertyStatus`/`RentalStage`/`AiLogStatus`/`MilestoneStatus` to the same String-based fix (same bug class, not yet live-broken); Clerk Organizations / proper multi-user tenancy (today's shared demo tenant is a manual, one-off workaround, not a real fix to the standing one-tenant-per-signup limitation); admin-specific navigation beyond the Overview table itself; setting up local webhook forwarding so real sign-ups sync without manual provisioning.

---

## 2026-07-23 — Feature: Clerk Organizations (Real Multi-User Tenancy) & Local Webhook Forwarding

- **Type:** Feature
- **Summary:** Closed the two gaps flagged at the end of last entry: the shared demo tenant was a manual, one-off workaround, and local webhook forwarding didn't exist at all. Wired real Clerk Organizations end to end — one Organization now maps to one Tenant, with Clerk's own org roles driving `User.role` and org membership driving `User.tenantId` — plus a new admin-only Team page (Clerk's own `<CreateOrganization />`/`<OrganizationProfile />`, no custom invite form built) and a documented local-tunnel runbook. A dedicated design-review pass (a second, independent look at the webhook design before writing it) caught three real correctness bugs in the first draft before any of them shipped — all three are detailed below since they're the kind of thing that would otherwise have looked fine in review. All verified: `tsc --noEmit`, full suite (233/233, up from 213), and `next build` all pass clean; every file touched this entry is at 100%/100%/100%/100%. **Not yet done:** the two live demo accounts (`n.themis2000@yahoo.gr`/`themisnik7@gmail.com`) have not been retrofitted into a real Clerk Organization — that step is blocked on you completing the manual Clerk Dashboard + ngrok setup this entry documents but can't perform on your own behalf.

### Why Clerk Organizations, not a custom invite table
`src/hooks/useTenant.ts` already anticipated this (`orgId ?? userId`) but nothing had ever wired a real `orgId` into existence — confirmed live that Organizations wasn't even enabled on this Clerk instance (a real `clerkClient.organizations.getOrganizationList()` call returned 403). A prior entry's own audit had already suggested Organizations as the direction; building a parallel custom membership/invite system instead would have duplicated what Clerk already does natively (member list, invite-by-email, role management, the actual email delivery) and gone around the grain of `CLAUDE.md`'s named auth provider rather than using it as intended.

### Three bugs a design-review pass caught before they shipped
1. **`organization.created` as a bare `create`, not an `upsert`.** Clerk/Svix is at-least-once delivery — this event *will* be redelivered in normal operation, and a bare `create` would hit the new `clerkOrgId` unique constraint on every redelivery and retry forever instead of settling. Fixed by upserting on `clerkOrgId`, both here and independently inside the membership handler (see #2) — the tenant side of this race needed to be closed twice, not once.
2. **No recency guard on `organizationMembership.*`,** unlike `user.updated`'s existing `lastSyncedAt` check. Without one: a user is removed from an org (correctly reassigned a fresh personal tenant) → a delayed/out-of-order redelivery of the *old* membership event arrives afterward → it would silently re-attach them to the org's tenant, reopening the exact cross-tenant leak the removal handling exists to prevent. Fixed with a dedicated `orgMembershipSyncedAt` column — deliberately **not** reusing `lastSyncedAt`, since that's driven by the independent `user.*` event stream with its own cadence; comparing two unrelated streams against one shared timestamp would produce false-stale/false-fresh results.
3. **Two uncoordinated writers of `User.role`.** `resolveRole()` (existing, in the plain `user.updated` path) silently defaults to `TENANT` whenever `publicMetadata.role` is unset — which it always is for an org-derived admin, since their adminhood comes from org membership, not metadata. Left alone, the next unrelated profile edit (a name change, anything) for any org admin would have silently demoted them back to `TENANT`. Fixed by having `user.updated` skip its own role write whenever the user's current tenant is org-backed (`tenant.clerkOrgId != null`) — org membership owns role from that point on; personal (non-org) accounts are completely unaffected.

### Task: webhook (`src/app/api/webhooks/clerk/route.ts`)
Added `organization.created`, `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted` handling (payload shapes verified directly against the installed `@clerk/backend` type definitions, not assumed — notably `organizationMembership.*`'s org id lives at `data.organization.id` and the target user id at `data.public_user_data.user_id`, neither a flat field). Restructured the whole handler from a chain of `if`-with-early-return checks to a `switch` on `evt.type`: TypeScript couldn't narrow the payload type correctly across the `if` chain (`organization.created`/`.updated` share one union member whose own `type` field is itself a two-value union, which a chain of individual `!==` checks combined with `&&` can't get TypeScript to reason about), and `tsc --noEmit` caught this immediately once real branches needed the narrowed shape. A removed member (`organizationMembership.deleted`) gets a brand-new personal tenant, mirroring `user.created`'s own bootstrap shape exactly, rather than being left with a stale `tenantId`.

### Task: admin Team page
New `/dashboard/team`, gated with the same `currentUser.role !== Role.ADMIN → notFound()` pattern as `dashboard/clients/[userId]`. Content is Clerk's own `<CreateOrganization />` (admin has no org yet) or `<OrganizationProfile />` (admin already has one) via a small client component (`TeamOrganizationPanel`), both with `routing="hash"` so they work inside this single route without a catch-all segment — no custom invite form, member table, or email delivery was built, since `<OrganizationProfile />` already provides all of it. `Sidebar` gained a new `isAdmin` prop (default `false`) and an `adminOnly` flag on nav items, so the "Team" entry only renders for admins; every existing page's `<Sidebar>` call was updated to pass it through.

### Task: local webhook forwarding
No first-party Clerk CLI tunnel exists — ngrok is Clerk's own documented approach. Added a full runbook to `ENVIRONMENT_DEPLOY.md` (new §3, sections renumbered 3→8 accordingly) covering the ngrok agent install, tunnel start, Clerk Dashboard endpoint registration (all six event types, not just the original two), and the signing-secret handoff into `CLERK_WEBHOOK_SECRET`. This is genuinely split between what's automatable and what isn't: creating an ngrok account and clicking through the Clerk Dashboard both require you, not a tool call — the runbook exists to make that one-time setup unambiguous, not to pretend it can be skipped. Also flagged the sequencing trap directly: enabling Organizations in the Dashboard *before* this tunnel is reachable means the very first test org's events hit the *old* code path (which still just acks anything it doesn't recognize) and are permanently dropped, needing manual backfill.

### Verification
`npx tsc --noEmit` clean (caught the `if`-chain narrowing bug directly, before any test ran) → `npm run test` 233/233 (25 files, up from 213/24 — 40 webhook tests up from 25, 6 Sidebar up from 4, 3 new for `TeamOrganizationPanel`) → `npm run test:coverage`: every file touched this entry 100%/100%/100%/100%, project-wide branch coverage 99.17% (unchanged pre-existing gaps only, in `ApiKeyCard.tsx`/`projects.ts`/`propertyOwnership.ts`, none touched this entry) → `npm run build` clean, `/dashboard/team` correctly `ƒ` dynamic alongside every other dashboard route.

- **Files touched:** `prisma/schema.prisma` (`Tenant.clerkOrgId`, `User.orgMembershipSyncedAt`), `supabase/migrations/0007_clerk_organizations.sql` (created, applied live), `src/app/api/webhooks/clerk/route.ts` (org/membership handling, `switch` restructure, role-precedence fix), `src/app/api/webhooks/clerk/route.test.ts` (15 new tests), `src/components/ui/Sidebar.tsx` (`isAdmin` prop, `adminOnly` nav flag), `src/__tests__/components/Sidebar.test.tsx`, `src/components/ui/TeamOrganizationPanel.tsx` (created), `src/__tests__/components/TeamOrganizationPanel.test.tsx` (created), `src/app/dashboard/team/page.tsx` (created), every other dashboard/settings page (`isAdmin` passed through to `Sidebar`), `ENVIRONMENT_DEPLOY.md` (new §3, renumbered, migration list updated, known-gaps line updated), `LOGS.md`.
- **Status:** Code, schema, migration, and docs complete and verified. **Update, same day:** Organizations is now enabled in the Clerk Dashboard (Membership optional, confirmed by you) — that part of the original "blocked on you" list is resolved. The other part — local ngrok forwarding — was explicitly decided **against**, not just left undone: this project will exercise webhook/organization behavior against a real deployed URL once it's on Vercel instead of a local tunnel, so `ENVIRONMENT_DEPLOY.md` §3 now documents ngrok only as optional reference, not this project's actual path (the ngrok CLI itself was installed then removed again in the same sitting once that was decided). Net effect: **no webhook endpoint exists anywhere yet** (neither local nor production), so `organization.created`/`organizationMembership.*` still have nowhere to be delivered — creating a real Organization before either exists would leave it with no matching `Tenant` row in Postgres. Retrofitting the two existing demo accounts into a real Organization is accordingly still not performed, and now explicitly deferred until after a real deploy, not merely "next." Deliberately not attempted, flagged rather than silently skipped: `organization.updated`/`organization.deleted` handling (name changes, org deletion — rare for this app's usage pattern); enforcing one-organization-per-user (Clerk itself allows more; this schema's single `tenantId` scalar assumes exactly one).

---

<!-- Future entries go below this line, most recent last -->
