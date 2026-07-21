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

## Clerk ↔ Supabase Third-Party Auth (JWT Bridge)

### Why this exists

RLS as defined in `supabase/migrations/0001_init.sql` only ever evaluates when a request reaches Postgres through **PostgREST** (i.e. via the Supabase client). Prisma connects directly to Postgres with its own credentials and never goes through PostgREST — every Prisma query is invisible to RLS and must filter by `tenant_id` in application code instead (see `src/lib/data/projects.ts`, `src/lib/auth/currentTenant.ts`). The bridge documented here is what makes RLS a *real* enforcement boundary for the one code path that does go through PostgREST (`src/lib/data/propertyOwnership.ts`) — until it's configured in both dashboards, `auth.jwt()` resolves to nothing and every RLS policy silently denies everything.

### Current mechanism (verified 2026-07-19 against live Clerk and Supabase documentation)

Clerk deprecated the old dedicated "Supabase JWT Template" integration on **2025-04-01**. A comment in `0001_init.sql` described that deprecated mechanism until this session corrected it — it had never been checked against live docs before. The only currently-recommended path is Supabase's native **Third-Party Auth** integration: Supabase trusts Clerk's own JWKS endpoint directly, so no shared JWT secret and no custom-named template are involved.

**Step 1 — Clerk Dashboard:**
1. Open the Supabase integration setup page in the Clerk Dashboard.
2. Click **Activate Supabase integration**.
3. Copy the **Clerk domain** it reveals (e.g. `your-app.clerk.accounts.dev`, or your custom domain).
4. This step alone makes Clerk add a `"role": "authenticated"` claim to every session token — required by PostgREST to treat the request as authenticated rather than anonymous. No manual claim configuration is needed for this specific claim.

**Step 2 — Supabase Dashboard:**
1. Go to **Authentication → Sign In / Providers → Third-Party Auth**.
2. Click **Add provider**, choose **Clerk**.
3. Paste the Clerk domain copied in Step 1.
4. For local development via the Supabase CLI, mirror the same config in `supabase/config.toml`:
   ```toml
   [auth.third_party.clerk]
   enabled = true
   domain = "your-app.clerk.accounts.dev"
   ```

**Step 3 — the `publicMetadata` claim (needed only for `app.is_admin()`):**
The native integration does not add this claim automatically — it's application-specific, not something Supabase's integration knows to add. As of this writing, adding it requires Clerk Dashboard → **Configure → Sessions → Customize session token**, with a custom claim:
```json
{ "publicMetadata": "{{user.public_metadata}}" }
```
⚠️ Unlike Steps 1–2 above, this exact menu path was **not** directly confirmed against a fetched docs page this session (neither vendor's page surfaced it — only `role: authenticated` was confirmed as auto-added). Verify the current label in your own dashboard before relying on it. If skipped, this fails silently, not loudly: `auth.jwt() -> 'publicMetadata'` evaluates to `NULL`, `app.is_admin()` returns `false`, and every admin-only policy quietly denies — indistinguishable from "admin has no data" unless you know to check this specific claim first.

**Step 4 — required environment variables** (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Neither exists in `.env` or `.env.local` yet — `src/lib/supabaseClient.ts` will throw at runtime (not at build time) the first time it's called without them.

**Step 5 — verification checklist:**
- [ ] Clerk Dashboard's Supabase integration setup page shows the integration as active.
- [ ] Supabase Dashboard → Third-Party Auth lists Clerk with the correct domain.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in the deployment environment.
- [ ] A live Clerk session token, decoded with a local/offline JWT decoder (never paste a real token into a hosted decoding site — it's a live credential), contains `sub`, `role: "authenticated"`, and (if Step 3 was done) `publicMetadata`.
- [ ] A signed-in, non-admin user's request through `getSupabaseClient(token)` returns only their own tenant's rows, never another tenant's.
- [ ] The same query built with `getSupabaseClient(null)` (no token — anonymous) returns zero rows from every RLS-protected table. This confirms default-deny, not default-allow.
- [ ] A user whose Clerk `publicMetadata.role` is `"admin"` can read `encrypted_api_keys`/`ai_logs`; a non-admin user gets zero rows from the same query.

### Application-side token flow

**Server Component (the pattern actually wired into this codebase — see `src/app/dashboard/property/page.tsx`):**
```ts
const { getToken } = await auth();         // @clerk/nextjs/server
const token = await getToken();            // no {template: ...} argument — that's the deprecated flow
const supabase = getSupabaseClient(token);
```
This runs entirely on the server; the Supabase client, the anon key, and the token never reach the browser.

**Client Component (`useAuth()`) — considered and rejected, not built:**
The literal pattern would be `const { getToken } = useAuth(); const token = await getToken(); const supabase = getSupabaseClient(token);` called from inside a `"use client"` component. This is **not shipped** here: the "Frontend / Backend Separation" rule at the top of this document is explicit — *"The frontend never talks to Supabase... directly"* — and a browser-side `getSupabaseClient` call is exactly that, regardless of the anon key not being an elevated-privilege credential. RLS would still protect the data even from a client-side call, but the rule as written is about which layer is allowed to construct the client at all, not just what that client can access. If a genuine need for browser-side reads emerges later, treat that as a deliberate amendment to this rule (worth its own discussion), not something to route around silently.

**Why `getSupabaseClient` uses a static header instead of the documented `accessToken` callback:** Supabase's current docs show `createClient(url, key, { async accessToken() { return session?.getToken() ?? null } })`. `src/lib/supabaseClient.ts` instead sets a static `Authorization` header at construction time. These produce the same request-level authentication outcome here specifically because `getSupabaseClient` is deliberately called fresh per request (see its own doc comment) with an already-resolved token — the `accessToken` callback's main advantage (lazy/repeated token refresh for a long-lived client) doesn't apply to a client that's discarded after one request. Not changed without a functional reason.

**Naming note:** Supabase is mid-rollout on renaming `anon key` → `publishable key` (and `service_role key` → `secret key`) across dashboards and docs; some current code samples already use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. This project's env var is named `NEXT_PUBLIC_SUPABASE_ANON_KEY` — confirm which key type your specific Supabase project actually issues before filling it in, since older and newer projects may expose different names for what is functionally the same credential.
