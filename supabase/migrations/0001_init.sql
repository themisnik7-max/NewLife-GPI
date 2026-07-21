-- NewLife GPI — initial schema + RLS
--
-- Column/table names here are handwritten to match prisma/schema.prisma's
-- @map/@@map directives exactly (Prisma Migrate is not used for this
-- project's migrations — RLS policies have no first-class Prisma DSL, so
-- this file is the source of truth for both DDL and policies; see
-- LOGS.md's "Schema & RLS" entry for the mechanical name-by-name diff run
-- against schema.prisma to confirm the two never drift apart).
--
-- AUTH INTEGRATION — READ BEFORE APPLYING:
-- This project uses Clerk (v6) for authentication, not Supabase Auth. For
-- auth.jwt() below to resolve anything, Clerk must be configured as a
-- Supabase "Third-Party Auth" provider (Supabase Dashboard → Authentication
-- → Sign In / Providers → Third-Party Auth → add Clerk, using your Clerk
-- instance's domain) and the Supabase client on the frontend must attach a
-- live Clerk session token as the request's bearer token. Full step-by-step
-- setup lives in ARCHITECTURE.md under "Clerk ↔ Supabase Third-Party Auth".
--
-- CORRECTED 2026-07-19: the paragraph originally here described a "custom
-- Clerk JWT Template" (Clerk Dashboard → JWT Templates) as the mechanism for
-- getting publicMetadata into the token. That JWT-template-based Supabase
-- integration was deprecated by Clerk on 2025-04-01 in favor of the native
-- Third-Party Auth integration described above — it was never actually
-- verified against live docs when first written. Corrected here after
-- checking Clerk's and Supabase's current documentation directly.
--
-- The JWT's `sub` claim (the Clerk user id, e.g. "user_2abc...") is present
-- on every Clerk session token by default — no extra setup needed for that.
--
-- The native integration also requires a `"role": "authenticated"` claim for
-- PostgREST to accept the request at all — this is added automatically once
-- "Activate Supabase integration" is turned on in the Clerk Dashboard's
-- Supabase setup page. No manual claim configuration needed for that part.
--
-- The `publicMetadata` claim used by is_admin() below is a different,
-- app-specific claim that the native integration does NOT add for you. As of
-- this writing it still requires Clerk's session token customization
-- (Clerk Dashboard → Configure → Sessions → Customize session token, NOT the
-- deprecated JWT Templates page) with a custom claim shaped like:
--   { "publicMetadata": "{{user.public_metadata}}" }
-- Unlike the two paragraphs above, this exact menu path was not directly
-- confirmed against a fetched docs page this session — verify the current
-- label in your own dashboard before relying on it.
-- Skipping this does not error — auth.jwt() -> 'publicMetadata' simply
-- evaluates to NULL, so is_admin() silently returns false and every
-- admin-only policy below silently denies. This is the single most likely
-- point of "why can't the admin see anything" confusion, so it's called out
-- here in addition to inline at is_admin().

create extension if not exists "pgcrypto";

-- ── Tables ───────────────────────────────────────────────────────

create table public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Mirrors the Clerk user (synced via Clerk webhooks using the Supabase
-- service-role key, which bypasses RLS entirely — end users never write to
-- this table directly through the client; see the write policies below).
-- clerk_user_id must equal the JWT `sub` claim exactly.
create table public.users (
  clerk_user_id text primary key,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  email         text not null unique,
  role          text not null default 'TENANT' check (role in ('ADMIN', 'TENANT', 'INVESTOR')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index users_tenant_id_idx on public.users(tenant_id);

create table public.properties (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null,
  address         text not null,
  area            text not null,
  total_units     integer not null,
  available_units integer not null,
  delivery_date   date not null,
  contract_date   date not null,
  floor           integer not null,
  sqm             double precision not null,
  energy_class    text not null,
  image_url       text not null,
  status          text not null default 'PLANNING' check (status in ('PLANNING', 'UNDER_CONSTRUCTION', 'COMPLETED')),
  map_url         text not null,
  ppt_url         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index properties_tenant_id_idx on public.properties(tenant_id);

-- Join table between users and properties. Not part of the interfaces given
-- in the request, but required to store rental_stage at all — it belongs to
-- a specific user's specific property, not a bare scalar — and it mirrors
-- payment_ledger already pairing user_id + property_id below.
create table public.property_ownerships (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  user_id      text not null references public.users(clerk_user_id) on delete cascade,
  property_id  uuid not null references public.properties(id) on delete cascade,
  rental_stage text not null default 'RESERVATION' check (rental_stage in (
    'RESERVATION', 'SPA_SIGNED', 'LEGAL_REVIEW', 'VENDORS_ENGAGED', 'VISA_SUBMISSION',
    'VISA_APPROVED', 'CONSTRUCTION_START', 'INTERIOR_CHOICES', 'HANDOVER', 'RENTAL_ACTIVE'
  )),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, property_id)
);
create index property_ownerships_tenant_id_idx on public.property_ownerships(tenant_id);

create table public.payment_ledger (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  property_id    uuid not null references public.properties(id) on delete cascade,
  user_id        text not null references public.users(clerk_user_id) on delete cascade,
  amount         double precision not null,
  due_date       date not null,
  is_delayed     boolean not null default false,
  penalty_amount double precision not null default 0,
  status         text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'OVERDUE')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index payment_ledger_tenant_id_idx on public.payment_ledger(tenant_id);
create index payment_ledger_property_id_idx on public.payment_ledger(property_id);
create index payment_ledger_user_id_idx on public.payment_ledger(user_id);

-- BYOK credential storage — shape matches ARCHITECTURE.md exactly.
create table public.encrypted_api_keys (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  provider      text not null,
  encrypted_key text not null,
  encryption_iv text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index encrypted_api_keys_tenant_id_idx on public.encrypted_api_keys(tenant_id);

-- Self-observability log — shape matches CLAUDE.md exactly (tenant_id added
-- per ARCHITECTURE.md's later, stricter multi-tenancy mandate).
create table public.ai_logs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  agent_action  text not null,
  status        text not null default 'RUNNING' check (status in ('RUNNING', 'SUCCESS', 'FAILED')),
  input_tokens  integer,
  output_tokens integer,
  cost          numeric(10, 4),
  metadata      jsonb,
  created_at    timestamptz not null default now()
);
create index ai_logs_tenant_id_idx on public.ai_logs(tenant_id);

-- ── Helper functions ─────────────────────────────────────────────
-- Must be created after the tables above (current_tenant_id queries users).

create schema if not exists app;

create or replace function app.current_clerk_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- Role is read from the Clerk JWT's publicMetadata claim, matched against
-- the literal lowercase string 'admin' — matching the exact check given
-- ("Clerk publicMetadata.role === 'admin'"), independent of this schema's
-- own Role enum, which is uppercase ('ADMIN') by Postgres/Prisma
-- convention. These are two separate systems (Clerk's externally-managed
-- metadata vs. this database's own role column) that happen to represent
-- the same concept with different casing — not a bug, but easy to trip
-- over, so it's called out explicitly here.
create or replace function app.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'publicMetadata' ->> 'role', '') = 'admin'
$$;

-- SECURITY DEFINER is required here, not optional: this function queries
-- public.users, which itself has RLS enabled below with a policy that
-- depends on current_tenant_id(). Without SECURITY DEFINER, that query
-- would be subject to the very RLS policy it's trying to help evaluate —
-- a circular lockout where nobody could ever resolve their own tenant_id.
-- `set search_path` is required alongside SECURITY DEFINER as a standard
-- Postgres hardening measure, to prevent search-path hijacking attacks
-- against a function that runs with elevated privileges.
create or replace function app.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tenant_id
  from public.users
  where clerk_user_id = app.current_clerk_user_id()
$$;

-- ── Row Level Security ───────────────────────────────────────────

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.properties enable row level security;
alter table public.property_ownerships enable row level security;
alter table public.payment_ledger enable row level security;
alter table public.encrypted_api_keys enable row level security;
alter table public.ai_logs enable row level security;

-- tenants: visible only as the caller's own tenant row.
create policy tenants_select on public.tenants
  for select using (id = app.current_tenant_id());

-- users: everyone in a tenant can see everyone else in the same tenant
-- (needed for admin client lists); only admins may write, and only within
-- their own tenant. Regular writes to this table happen via the Clerk
-- webhook sync using the service-role key, which bypasses RLS.
create policy users_select on public.users
  for select using (tenant_id = app.current_tenant_id());

create policy users_admin_insert on public.users
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());

create policy users_admin_update on public.users
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy users_admin_delete on public.users
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());

-- properties: readable by anyone in the tenant (browsing the catalog is not
-- role-restricted); writable only by admins.
create policy properties_select on public.properties
  for select using (tenant_id = app.current_tenant_id());

create policy properties_admin_insert on public.properties
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());

create policy properties_admin_update on public.properties
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy properties_admin_delete on public.properties
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());

-- property_ownerships: a user sees only their own ownership row(s); admins
-- see every ownership row in their tenant. Rental-stage progression is
-- admin/system-controlled only — a tenant or investor cannot self-advance
-- their own stage.
create policy property_ownerships_select on public.property_ownerships
  for select using (
    tenant_id = app.current_tenant_id()
    and (user_id = app.current_clerk_user_id() or app.is_admin())
  );

create policy property_ownerships_admin_insert on public.property_ownerships
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());

create policy property_ownerships_admin_update on public.property_ownerships
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy property_ownerships_admin_delete on public.property_ownerships
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());

-- payment_ledger: a user sees only their own payment rows; admins see every
-- payment row in their tenant. Writes are admin-only — a tenant must never
-- be able to mark their own payment PAID or waive their own penalty.
create policy payment_ledger_select on public.payment_ledger
  for select using (
    tenant_id = app.current_tenant_id()
    and (user_id = app.current_clerk_user_id() or app.is_admin())
  );

create policy payment_ledger_admin_insert on public.payment_ledger
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());

create policy payment_ledger_admin_update on public.payment_ledger
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy payment_ledger_admin_delete on public.payment_ledger
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());

-- encrypted_api_keys: admin-only, full stop. These are BYOK secrets that
-- ARCHITECTURE.md requires stay decrypted server-side only; no non-admin
-- role has any legitimate reason to read even the encrypted blob.
create policy encrypted_api_keys_admin_all on public.encrypted_api_keys
  for all using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (app.is_admin() and tenant_id = app.current_tenant_id());

-- ai_logs: admin-only read. These are internal operational logs, not
-- user-facing data. Writes happen exclusively from server code using the
-- service-role key (which bypasses RLS), so no insert/update/delete policy
-- is defined — the absence is deliberate, not an oversight.
create policy ai_logs_admin_select on public.ai_logs
  for select using (app.is_admin() and tenant_id = app.current_tenant_id());
