# Production Environment & Deploy Checklist

An ordered, operational runbook for taking this project from a working local
checkout to a live production deployment. This file tells you **what to do,
in what order**. For **why** the Clerk/Supabase pieces work the way they do
(and the exact dashboard menu paths, verified against live docs on
2026-07-19), see `ARCHITECTURE.md`'s "Clerk ↔ Supabase Third-Party Auth"
section — this document references it rather than duplicating it, so the two
can't silently drift apart.

Nothing in this checklist has been executed yet. It is written from the
current repo state (`git remote` is `https://github.com/themisnik7-max/NewLife-GPI.git`),
not from having actually run a deployment.

---

## 0. Prerequisites

- [ ] A Supabase project (Postgres 15+, with the `pgcrypto` extension available — enabled automatically by `supabase/migrations/0001_init.sql`).
- [ ] A Clerk application/instance.
- [ ] A Vercel project connected to this repository (or equivalent Next.js host — this checklist assumes Vercel, matching `CLAUDE.md`'s stack declaration).
- [ ] The [Supabase CLI](https://supabase.com/docs/guides/cli) installed locally if you intend to run migrations from your machine rather than the Supabase Dashboard's SQL editor. It is **not** an npm dependency of this repo (`package.json` has no `supabase` package) — install it as a standalone tool.
- [ ] Node version matching this repo's tooling (`next@14.2.35`, `typescript@5.5.4` — see `package.json`).

---

## 1. Environment variables

Copy `.env.example` and fill in real values. Split across two files exactly as `.env.example` already documents — `.env` for values Prisma's CLI reads directly, `.env.local` for values Next.js loads at runtime — and set the production equivalents of both in your host's environment variable settings (e.g. Vercel Project Settings → Environment Variables), not just locally.

| Variable | File | Status | Source |
|---|---|---|---|
| `DATABASE_URL` | `.env` | Required | Supabase Dashboard → Project Settings → Database → pooled connection string (port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | `.env` | Required | Same page, **direct** connection string (port 5432) — used for migrations, bypasses the pooler |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` | Required | Clerk Dashboard → API Keys |
| `CLERK_SECRET_KEY` | `.env.local` | Required | Clerk Dashboard → API Keys |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `.env.local` | Required | Your own route paths (`/sign-in`, `/sign-up` — already the values in `.env.example`) |
| `CLERK_WEBHOOK_SECRET` | `.env.local` | **Not set yet** | Clerk Dashboard → Webhooks → your endpoint → Signing Secret (see §2 below — the endpoint has to exist before this secret exists) |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | **Not set yet** | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | **Not set yet** | Same page |
| `API_KEY_ENCRYPTION_SECRET` | `.env` | **Not set yet** | Generate yourself: `openssl rand -base64 32`. Must decode to exactly 32 bytes — `src/lib/data/apiKeys.ts` throws otherwise. |

⚠️ `API_KEY_ENCRYPTION_SECRET` has no versioning in this schema (see `.env.example`'s own comment and `EncryptedApiKey` in `prisma/schema.prisma`). Generate it once, store it durably (e.g. in your password manager, not just in Vercel's dashboard alone), and treat rotating it as **destroying every previously-encrypted API key** — there is no re-encryption migration path today.

⚠️ Never commit `.env`/`.env.local`, and never paste real values from either into chat, a PR description, or a public issue.

---

## 2. Dashboard clickthroughs

These cannot be scripted — they require clicking through the Clerk and Supabase dashboards by hand. Full detail and rationale: `ARCHITECTURE.md` → "Clerk ↔ Supabase Third-Party Auth". Condensed as an ordered checklist:

- [ ] **Clerk Dashboard** → Supabase integration setup page → **Activate Supabase integration** → copy the revealed Clerk domain.
- [ ] **Supabase Dashboard** → Authentication → Sign In / Providers → **Third-Party Auth** → Add provider → Clerk → paste the domain from the previous step.
- [ ] If you develop locally against the Supabase CLI (not just the hosted dashboard), create `supabase/config.toml` (it does not exist in this repo yet) with:
  ```toml
  [auth.third_party.clerk]
  enabled = true
  domain = "your-app.clerk.accounts.dev"
  ```
- [ ] **Clerk Dashboard** → Configure → Sessions → Customize session token → add the `publicMetadata` claim (needed only for `app.is_admin()` in the RLS policies; see ARCHITECTURE.md's ⚠️ note — this exact menu path was not independently re-verified against live docs, confirm it still matches before relying on it):
  ```json
  { "publicMetadata": "{{user.public_metadata}}" }
  ```
- [ ] **Clerk Dashboard** → Webhooks → Add Endpoint → point it at `https://<your-production-domain>/api/webhooks/clerk`, subscribe to `user.created` and `user.updated` → copy the **Signing Secret** into `CLERK_WEBHOOK_SECRET` (§1).
- [ ] Set every "Not set yet" row from §1 in both your local `.env`/`.env.local` **and** your host's production environment variables.

If any of Steps 1–2 above are skipped, nothing errors loudly — `auth.jwt()` simply resolves to `NULL` inside Postgres, and every RLS policy that depends on it silently denies. See the verification checklist in §6 before trusting that this part is actually working.

---

## 3. Database migration pipeline

**This project does not use `npx prisma migrate deploy`.** `prisma.config.ts` declares `migrations.path: "prisma/migrations"`, but no such directory exists in this repo — there is no Prisma-generated migration history to deploy. Every schema change is instead handwritten, reviewed SQL under `supabase/migrations/`, applied directly to Postgres; `prisma/schema.prisma` is kept in sync by hand alongside it (see `supabase/migrations/0001_init.sql`'s own header comment). Attempting `prisma migrate deploy` against this repo as it stands today would find no local migration history and do nothing useful — don't rely on it.

The real pipeline:

1. **Apply the SQL migrations, in strict numeric order, exactly once each:**
   ```
   supabase/migrations/0001_init.sql
   supabase/migrations/0002_api_key_sync.sql
   supabase/migrations/0003_add_webhook_metadata.sql
   supabase/migrations/0004_payment_ledger_partial_payments.sql
   supabase/migrations/0005_construction_and_visa.sql
   ```
   Either:
   - `supabase db push` (Supabase CLI, linked to your project via `supabase link`), or
   - paste each file's contents into the Supabase Dashboard's SQL Editor and run them in order, one at a time.

   Track which files have already been applied to each environment yourself (e.g. a checklist in your deploy PR) — nothing in this repo currently records migration state the way Prisma Migrate's own `_prisma_migrations` table would.

2. **Regenerate the Prisma client** so its types match the schema you just applied:
   ```
   npx prisma generate
   ```
   This reads `prisma/schema.prisma` (not the database) and writes to `generated/prisma/` (see the `generator client` block's `output` path). It does not touch the database — run it any time the schema file changes, independent of step 1.

3. **Validate the schema file itself matches what Prisma can parse:**
   ```
   npx prisma validate
   ```

⚠️ Because steps 1 and 2 are two independent files (raw SQL vs. `schema.prisma`) kept in sync by hand, a migration applied to the database without a matching `schema.prisma` update (or vice versa) will not error at migration time — it will surface later as a Prisma query against a column/table that doesn't exist, or a runtime row shape the application code doesn't expect. Always update both in the same commit.

---

## 4. Build

```
npm run test
npm run test:coverage
npx tsc --noEmit
npm run build
```

All four must pass before deploying — this mirrors `CLAUDE.md`'s standing testing mandate, not a deploy-specific addition. `npm run build` in particular will fail at build time (not just at runtime) if a Server Component imports something `server-only` from a Client Component boundary incorrectly, so a clean local build is a real signal, not just a formality.

---

## 5. Deploy (Vercel)

- [ ] Confirm every variable from §1 is set in the target Vercel environment (Production, and separately Preview if you want webhooks/Supabase to work on preview deployments too — Clerk webhooks in particular need a publicly reachable URL, so `CLERK_WEBHOOK_SECRET`/the webhook endpoint won't work against `localhost`).
- [ ] Push/merge to the branch Vercel deploys from. (No CI pipeline currently runs the §4 checks automatically on this repo — until one exists, running them locally before pushing is the only gate.)
- [ ] Confirm the deployment's build logs show the four `/dashboard/*` dynamic routes (`rental`, `payments`, plus `construction`/`visa` once those pages exist — see the note in §7) rendering as `ƒ` (dynamic), not `○` (static) — a page that fetches real per-tenant data statically-rendering would mean it got baked at build time with no real user's data, which is wrong for every one of these routes.

---

## 6. Post-deploy verification checklist

Directly from `ARCHITECTURE.md`'s own verification checklist — repeated here so a deploy isn't considered done until these are actually checked against the live environment, not just configured:

- [ ] Clerk Dashboard's Supabase integration setup page shows the integration as **active**.
- [ ] Supabase Dashboard → Third-Party Auth lists Clerk with the correct domain.
- [ ] A live Clerk session token, decoded with a local/offline JWT decoder (never paste a real token into a hosted decoding site), contains `sub`, `role: "authenticated"`, and `publicMetadata`.
- [ ] A signed-in, non-admin user's request through `getSupabaseClient(token)` returns only their own tenant's rows, never another tenant's.
- [ ] The same query built with `getSupabaseClient(null)` (no token) returns zero rows from every RLS-protected table — confirms default-deny.
- [ ] An admin user (`publicMetadata.role === "admin"`) can read `encrypted_api_keys`/`ai_logs`; a non-admin user gets zero rows from the same query.
- [ ] Trigger a real Clerk `user.created` event (sign up a test user against production) and confirm a matching row appears in `public.users` with a real, freshly-provisioned `tenant_id` — not a shared/default one.
- [ ] Submit a test webhook delivery from Clerk's Dashboard (Webhooks → your endpoint → **Testing** tab) and confirm it returns `200` and appears correctly in your logs.

---

## 7. Known gaps not covered by this deploy

Carried over from the current backlog, not resolved by this pass — do not assume production-readiness beyond what's listed above:

- `/dashboard/construction` and `/dashboard/visa` **pages** don't exist yet. This pass added the database models (`ConstructionMilestone`, `VisaStep`), RLS policies, and data-access functions (`getPropertyMilestones`, `getUserVisaSteps`) backing them, per `FRONTEND_SPEC.md` — but no route/component wires them up yet. Deploying today ships working backend plumbing for two pages that don't render anything yet.
- No CI pipeline currently runs `npm run test` / `npm run build` automatically on push — §4's checks are manual today.
- Organization-based multi-user tenants, admin-specific navigation, and dark mode remain open product decisions, unaffected by this deploy.
