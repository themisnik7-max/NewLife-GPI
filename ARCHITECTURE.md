# ARCHITECTURE.md — Structural Blueprint

This document defines the structural design of the system: the separation of concerns between frontend and backend, the multi-tenancy data model, and the Bring Your Own Key (BYOK) pattern for API credentials.

## Frontend / Backend Separation

The system maintains a strict boundary between the visual frontend application and the backend server layer.

- **Frontend (client):** Next.js App Router pages, layouts, and client components. Responsible only for presentation, user interaction, and calling backend logic through Server Actions or route handlers. The frontend never talks to Supabase, third-party LLM APIs, or any secret-bearing service directly.
- **Backend (server):** Next.js Server Actions and server-only modules. Responsible for all database access, authentication checks (via Clerk), API-key handling, LLM calls, and business logic. All secrets, service-role keys, and encrypted credentials live and are used only on the server.

Rule: no Supabase client with elevated privileges, no decrypted API key, and no LLM request may ever be constructed in client-side code.

## Multi-Tenancy Isolation

The database is designed for **absolute multi-tenant isolation**. Every table — without exception — must include a required `tenant_id` column.

This applies to (including but not limited to):

| Table | Notes |
|---|---|
| `clients` | `tenant_id` required, indexed |
| `analytics` | `tenant_id` required, indexed |
| `encrypted_api_keys` | `tenant_id` required, indexed |
| `ai_logs` | `tenant_id` required, indexed |
| Any future table | `tenant_id` required, indexed |

Enforcement rules:
- `tenant_id` is `NOT NULL` on every table — no nullable escape hatch.
- Every query must be scoped by `tenant_id`, either via application-layer filtering or Supabase Row-Level Security (RLS) policies keyed on `tenant_id`.
- No cross-tenant query is permitted, including for admin/reporting features — those must aggregate through tenant-scoped views, not raw cross-tenant scans.

## Role scoping: admin is the system of record (2026-07-27)

Tenant isolation above answers "which organization's data is this?". A second,
independent question runs alongside it: **within one tenant, whose data is
this?** Every dashboard route now answers both, and the two must not be
conflated — the admin and a client share a tenant in this deployment, so
tenant scoping alone would show each of them the other's data.

Every shared route renders a genuinely different screen per role:

| Route | ADMIN sees | TENANT sees |
|---|---|---|
| `/dashboard` | Business-wide KPIs (`getTenantMetrics`) | Their own workflow summary |
| `/dashboard/clients` | The client roster | **404** |
| `/dashboard/property` | Every property sold, with buyers | Their own unit |
| `/dashboard/property/[id]` | Buyers, sale date/price, sale editor | **404** |
| `/dashboard/visa` | Every client's application | Their own timeline |
| `/dashboard/payments` | Every installment in the tenant | Their own schedule |
| `/dashboard/rental` | The lettings inventory | Their own ten-stage tracker |

Rules this depends on, all application-level because **Prisma bypasses RLS
entirely** (see the section below):

- **Two functions, not one function with a flag.** A tenant-wide reader
  (`getTenantVisaOverview`, `getTenantPaymentsOverview`, `getSoldProperties`)
  and a per-user reader (`getUserVisaSteps`, `getUserLedger`,
  `getClientPropertySnapshot`) are separate exports. Collapsing them into one
  function whose scope depends on an argument is how a page leaks by passing
  `undefined`.
- **Admin-only readers cannot check the session themselves** — they take a
  subject id that is not the caller's. The *page* performs the role check and
  calls `notFound()`; the data function's doc comment says so explicitly.
- **404, never "access denied"**, for a non-admin hitting an admin route: a
  403 confirms the route exists to someone who should not know it does.
- **`getClientProfile` vs `getOwnClientProfile`.** `users.admin_notes` is
  readable by the client under RLS's own `users_select` policy (it is their
  row), so RLS does *not* protect it. Withholding it is entirely the job of
  these being two functions.

## Bring Your Own Key (BYOK) Pattern

Users supply and are billed through their own upstream developer account credentials (e.g. their own LLM provider API key), rather than the platform absorbing usage cost.

### `encrypted_api_keys` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `tenant_id` | uuid | required, FK to tenant |
| `provider` | varchar | e.g. `anthropic`, `openai` |
| `encrypted_key` | text | encrypted at rest, never stored in plaintext |
| `encryption_iv` | text | initialization vector for decryption |
| `created_at` | timestamp | |
| `last_used_at` | timestamp | nullable |

### Server-side validation requirements

- API keys are decrypted **only** in server-side code, only at the moment of use, and never logged or returned to the client in decrypted form.
- Before any provider request is made, the backend must verify the decrypted key belongs to the requesting tenant (`tenant_id` match) — a key must never be usable outside the tenant that owns it.
- All token/usage transactions from a request must be attributed to and charged against the tenant's own key/account — the platform's own credentials must never be substituted as a fallback, silently or otherwise.
- Key decryption failures or provider auth failures must be caught and logged (see `ai_logs`) rather than causing silent fallthrough.
## Data access: Prisma only (PostgREST path removed 2026-07-27)

Supabase remains this project's database — a managed Postgres instance running 24/7. What was removed is the **Supabase JS client / PostgREST** read path, which was a second, parallel way of reaching that same database.

### Why it was removed

Three pages (`/dashboard/property`, `/dashboard/construction`, `/dashboard/rental`) read through `@supabase/supabase-js` and depended on the Clerk ↔ Supabase Third-Party Auth bridge to verify the caller's JWT. That bridge is a manual, two-dashboard configuration step that was documented here but never performed, so those three pages returned `No suitable key or wrong key type` and served HTTP 500 — confirmed by live browser testing against both localhost and production on 2026-07-27. Every other page in the app already used Prisma and was unaffected.

Rather than complete the bridge, the three pages were moved onto the Prisma path that the rest of the application already used. This removes an entire class of configuration-dependent failure and leaves exactly one way to read data.

### What this means for tenant isolation

**RLS is no longer an enforcement boundary anywhere in this application.** It was already bypassed by ~90% of the code (Prisma connects directly to Postgres with its own credentials and never passes through PostgREST); it is now bypassed by 100%.

Tenant isolation is therefore enforced **entirely in application code**, and every data-access function must be treated as security-critical:

- Every read filters explicitly by `tenantId` (and by `userId` where the row is per-user).
- Every write verifies that each referenced entity belongs to the caller's tenant *before* writing — see `assignPropertyToClient` / `createLedgerEntry`.
- `tenantId` is always resolved server-side from the signed-in session (`getCurrentUser()`), never accepted as a parameter from the client.

⚠️ One specific trap, worth stating plainly: the removed `getOwnedProperty()` took only a `tenantId` and leaned on RLS to add `user_id = app.current_clerk_user_id()` implicitly. Its replacement, `getClientPropertySnapshot(tenantId, userId)`, takes that filter explicitly. Dropping the `userId` argument would not fail loudly — it would silently return whichever tenant member's row was most recent. In the current deployment the admin and the demo client share one tenant, so that would surface the client's property on the admin's own "My Property" page.

### The RLS policies themselves

The policies in `supabase/migrations/*.sql` are intentionally left in place. They cost nothing, they remain correct, and they would become live again if anything ever reads this database through PostgREST (for example a future analytics or reporting tool). They are simply not what protects the application today.
