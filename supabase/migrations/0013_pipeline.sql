-- Adds public.contacts and public.deals — the pre-sale half of the CRM.
-- Matches prisma/schema.prisma's Contact and Deal models and is consumed by
-- src/lib/data/pipeline.ts.
--
-- WHY CONTACTS ARE NOT USERS. `users.clerk_user_id` IS the Clerk user id —
-- 0001_init.sql says so and every RLS helper in this schema resolves through
-- it — so a user row cannot exist before a Clerk account does. Modelling
-- prospects as users would have meant provisioning a Clerk account for
-- everyone who ever left a phone number, or making that column nullable and
-- unpicking the identity model the whole application rests on. A contact is a
-- record the business owns; an account is something the person creates. The
-- gap between them is real, and contacts.clerk_user_id is where they join.
--
-- contacts.clerk_user_id is UNIQUE but has NO foreign key. Unique because one
-- Clerk account must never be claimed by two contact records. No FK because
-- the link is established by matching email when the Clerk webhook fires, and
-- a cascading FK would make deleting a user destroy the pre-sale history
-- (every call and viewing logged before they bought) rather than orphan it —
-- the same reasoning that keeps audit_logs.entity_id unconstrained in 0008.
--
-- deals.stage DOES carry a check constraint, unlike documents.category in
-- 0010. The stages are the spine of the board: a typo'd value would silently
-- create a phantom column that no code renders and no query finds. The list
-- changing is a deliberate, reviewed event, not routine business vocabulary
-- churn — so the migration cost is the point rather than the problem.

create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  first_name    text not null,
  last_name     text,
  email         text,
  phone         text,
  nationality   text,
  -- Free text, not an enum: every business invents its own channels and a
  -- check constraint would make each new one a migration.
  source        text,
  notes         text,
  clerk_user_id text unique,
  owner_user_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index contacts_tenant_id_idx on public.contacts(tenant_id);
-- Backs the conversion lookup, which matches an incoming Clerk account to an
-- existing contact by email within one tenant.
create index contacts_tenant_email_idx on public.contacts(tenant_id, email);

create table public.deals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  contact_id          uuid not null references public.contacts(id) on delete cascade,
  -- Nullable: a deal exists from the first conversation, long before a
  -- specific unit is chosen. Forcing a property at creation would mean
  -- inventing one.
  property_id         uuid references public.properties(id) on delete set null,
  title               text not null,
  stage               text not null default 'NEW_LEAD' check (stage in (
                        'NEW_LEAD', 'QUALIFIED', 'VIEWING', 'OFFER',
                        'RESERVATION', 'CONTRACT', 'WON', 'LOST')),
  -- numeric, not double precision — binary floating point is the wrong type
  -- for money (see property_ownerships.sale_price in 0009). Nullable rather
  -- than defaulting to zero: a lead with no number attached is a real state,
  -- and zero would drag every forecast down with fictional certainty.
  value               numeric(12, 2),
  expected_close_date date,
  won_at              timestamptz,
  lost_at             timestamptz,
  lost_reason         text,
  owner_user_id       text,
  -- double precision, not integer, specifically so a card dropped between two
  -- others takes the midpoint of their positions and only ONE row is
  -- rewritten. Integer positions would require renumbering every card below
  -- the insertion point on every single drag.
  position            double precision not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index deals_tenant_id_idx on public.deals(tenant_id);
create index deals_tenant_stage_idx on public.deals(tenant_id, stage);
create index deals_contact_id_idx on public.deals(contact_id);

alter table public.contacts enable row level security;
alter table public.deals enable row level security;

-- ADMIN-ONLY on both, with no client-facing select policy at all — unlike
-- documents and activities, which have a visible_to_client escape hatch.
-- There is deliberately no such column here: a prospect has no account and
-- therefore no session, and a signed-up client has no business reading the
-- pipeline they were once a lead in (its notes, its lost reasons, what the
-- business thought the deal was worth). As everywhere else in this schema
-- these policies are not what protects the application today — Prisma
-- bypasses RLS (ARCHITECTURE.md) — they are kept correct so they become live
-- again if anything ever reads through PostgREST.
create policy contacts_admin_select on public.contacts
  for select using (app.is_admin() and tenant_id = app.current_tenant_id());
create policy contacts_admin_insert on public.contacts
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());
create policy contacts_admin_update on public.contacts
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy contacts_admin_delete on public.contacts
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());

create policy deals_admin_select on public.deals
  for select using (app.is_admin() and tenant_id = app.current_tenant_id());
create policy deals_admin_insert on public.deals
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());
create policy deals_admin_update on public.deals
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy deals_admin_delete on public.deals
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());
