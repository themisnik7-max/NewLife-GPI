-- Adds construction_milestones and visa_steps, backing the "/dashboard/
-- construction" and "/dashboard/visa" screens specified in FRONTEND_SPEC.md
-- (Construction: "Milestone tracker"; GoldenVisa: "5-step application
-- timeline"). Matches prisma/schema.prisma's ConstructionMilestone/VisaStep
-- models and their shared MilestoneStatus enum — see that file for the full
-- reasoning behind each column.
--
-- NUMBERING NOTE: the originating task named this file
-- 0004_construction_and_visa.sql, but 0004 is already taken by
-- 0004_payment_ledger_partial_payments.sql (the most recent migration on
-- disk before this one). Numbered 0005 here to continue the existing
-- sequence rather than collide with it.
--
-- STATUS COLUMN NOTE: like every other enumerated column in this schema
-- (users.role, properties.status, payment_ledger.status,
-- encrypted_api_keys... via Prisma's ApiKeyStatus, property_ownerships.rental_stage),
-- this uses `text ... check (... in (...))`, not a native Postgres
-- `create type ... as enum`, to match this file's own established
-- convention rather than introduce a second, differently-behaved enum
-- mechanism — native Postgres enums also complicate later value changes
-- (ALTER TYPE ... ADD VALUE cannot run inside the same transaction as other
-- DDL/DML), which every existing status column here avoids entirely.

create table public.construction_milestones (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  property_id     uuid not null references public.properties(id) on delete cascade,
  title           text not null,
  description     text,
  status          text not null default 'PENDING' check (status in ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  target_date     date not null,
  completion_date date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index construction_milestones_tenant_id_idx on public.construction_milestones(tenant_id);
create index construction_milestones_property_id_idx on public.construction_milestones(property_id);

-- Golden Visa application steps — per-user, unlike construction_milestones
-- above (per-property, not per-user). unique(user_id, step_order) mirrors
-- property_ownerships' own unique(user_id, property_id): two rows both
-- claiming to be the same user's "step 3" is a data integrity bug, not a
-- valid state.
create table public.visa_steps (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  user_id      text not null references public.users(clerk_user_id) on delete cascade,
  step_order   integer not null,
  title        text not null,
  description  text,
  status       text not null default 'PENDING' check (status in ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, step_order)
);
create index visa_steps_tenant_id_idx on public.visa_steps(tenant_id);
create index visa_steps_user_id_idx on public.visa_steps(user_id);

-- ── Row Level Security ───────────────────────────────────────────
-- Reuses app.current_tenant_id() / app.current_clerk_user_id() / app.is_admin(),
-- all defined in 0001_init.sql — no new helper functions needed here.

alter table public.construction_milestones enable row level security;
alter table public.visa_steps enable row level security;

-- construction_milestones: tenant-wide read, the same visibility model as
-- public.properties itself — tracking a property's build progress is not
-- restricted to whichever specific user "owns" it, matching
-- getPropertyMilestones(tenantId, propertyId)'s own signature, which takes
-- no user_id. Writes are admin-only, matching every other progress-tracking
-- table here.
create policy construction_milestones_select on public.construction_milestones
  for select using (tenant_id = app.current_tenant_id());

create policy construction_milestones_admin_insert on public.construction_milestones
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());

create policy construction_milestones_admin_update on public.construction_milestones
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy construction_milestones_admin_delete on public.construction_milestones
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());

-- visa_steps: a user sees only their own steps; admins see every step in
-- their tenant — same shape as payment_ledger_select/property_ownerships_select.
-- Writes are admin-only: a client must never be able to mark their own visa
-- step COMPLETED themselves, the same reasoning 0001_init.sql already
-- applies to rental_stage ("a tenant or investor cannot self-advance their
-- own stage").
create policy visa_steps_select on public.visa_steps
  for select using (
    tenant_id = app.current_tenant_id()
    and (user_id = app.current_clerk_user_id() or app.is_admin())
  );

create policy visa_steps_admin_insert on public.visa_steps
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());

create policy visa_steps_admin_update on public.visa_steps
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy visa_steps_admin_delete on public.visa_steps
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());
