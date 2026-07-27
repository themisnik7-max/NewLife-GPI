-- Adds public.audit_logs and public.rental_stage_records, and DROPS
-- public.property_ownerships.rental_stage — matching prisma/schema.prisma's
-- new AuditLog and RentalStageRecord models and the removed
-- PropertyOwnership.rentalStage field. Consumed by
-- src/lib/data/audit.ts and src/lib/data/rentalStages.ts.
--
-- ⚠️ DESTRUCTIVE: dropping rental_stage discards its data. This is
-- deliberate and there is no backfill, unlike 0004_payment_ledger_partial_
-- payments.sql where every existing row had a correct starting value. The
-- old column held PURCHASE-workflow states (RESERVATION, SPA_SIGNED,
-- LEGAL_REVIEW, VENDORS_ENGAGED, VISA_SUBMISSION, VISA_APPROVED,
-- CONSTRUCTION_START, INTERIOR_CHOICES, HANDOVER, RENTAL_ACTIVE); the
-- replacement models a LETTING workflow (mandate signed, inspection, keys,
-- energy certificate, viewings, offer, contract, broker's fee). There is no
-- honest mapping between the two vocabularies, so inventing one would
-- fabricate history rather than preserve it. At the time of writing this
-- affects exactly one demo row holding 'VENDORS_ENGAGED'.
--
-- STATUS COLUMN NOTE: audit_logs.action and rental_stage_records.status use
-- `text ... check (... in (...))`, matching every other enumerated column in
-- this schema (users.role, properties.status, payment_ledger.status,
-- construction_milestones.status, visa_steps.status) — never a native
-- Postgres `create type ... as enum`, for the reasons set out in
-- 0005_construction_and_visa.sql.
--
-- rental_stage_records.stage_key deliberately has NO check constraint: the
-- stage list is business process, expected to change, and a check would turn
-- every revision into a migration. It is validated in application code
-- against the canonical list in src/lib/data/rentalStages.ts on both read
-- and write.

-- ── Audit log ────────────────────────────────────────────────────────────
-- Append-only: created_at only, no updated_at, no application UPDATE/DELETE
-- path. entity_type/entity_id are plain text rather than real FKs so an
-- audit row survives its subject being deleted — a cascading FK would erase
-- exactly the history this table exists to keep.
create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  actor_user_id text not null references public.users(clerk_user_id) on delete cascade,
  entity_type   text not null,
  entity_id     text not null,
  action        text not null check (action in ('CREATE', 'UPDATE', 'DELETE')),
  field         text,
  old_value     text,
  new_value     text,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);
create index audit_logs_tenant_id_idx on public.audit_logs(tenant_id);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at);

alter table public.audit_logs enable row level security;

-- Admin-read-only, with no insert/update/delete policy at all — the same
-- shape and reasoning as ai_logs_admin_select in 0001_init.sql: these are
-- internal operational records, written server-side through Prisma (which
-- bypasses RLS entirely), and nothing should ever mutate them through
-- PostgREST. The absence of write policies is deliberate, not an omission.
create policy audit_logs_admin_select on public.audit_logs
  for select using (app.is_admin() and tenant_id = app.current_tenant_id());

-- ── Rental stage records ─────────────────────────────────────────────────
-- One row per stage a client has actually reached; absence of a row means
-- PENDING (see the RentalStageRecord doc comment in prisma/schema.prisma).
create table public.rental_stage_records (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  user_id               text not null references public.users(clerk_user_id) on delete cascade,
  stage_key             text not null,
  stage_order           integer not null,
  status                text not null default 'PENDING' check (status in ('PENDING', 'DONE')),
  completed_at          timestamptz,
  attachment_path       text,
  attachment_filename   text,
  offer_price           numeric(12, 2),
  offer_duration_months integer,
  offer_comments        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, stage_key)
);
create index rental_stage_records_tenant_id_idx on public.rental_stage_records(tenant_id);
create index rental_stage_records_user_id_idx on public.rental_stage_records(user_id);

alter table public.rental_stage_records enable row level security;

-- Same four-policy template as visa_steps in 0005_construction_and_visa.sql:
-- a client sees only their own stages, admins see every stage in their
-- tenant, and only admins may write. This preserves the rule stated on
-- property_ownerships in 0001_init.sql — stage progression is
-- admin/system-controlled; a tenant cannot self-advance their own stage.
create policy rental_stage_records_select on public.rental_stage_records
  for select using (
    tenant_id = app.current_tenant_id()
    and (user_id = app.current_clerk_user_id() or app.is_admin())
  );

create policy rental_stage_records_admin_insert on public.rental_stage_records
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());

create policy rental_stage_records_admin_update on public.rental_stage_records
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy rental_stage_records_admin_delete on public.rental_stage_records
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());

-- ── Drop the superseded scalar ───────────────────────────────────────────
alter table public.property_ownerships
  drop column if exists rental_stage;
