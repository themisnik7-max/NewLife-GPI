-- Adds public.activities — calls, emails, meetings, notes and tasks recorded
-- against any record. Matches prisma/schema.prisma's Activity model and is
-- consumed by src/lib/data/activities.ts.
--
-- WHY THIS IS NOT audit_logs. Both tables carry a polymorphic subject, both
-- are rendered in one merged timeline, and it is a fair question why there
-- are two. They differ in the one way that matters: an audit row is written
-- BY the system as the immutable consequence of a mutation and has no update
-- or delete path at all (see 0008 — it deliberately has no write policies);
-- an activity is written BY a person, is their fallible account of something
-- that happened outside this system, and must be correctable. Merging them
-- would have forced a choice between making audit rows editable — destroying
-- the guarantee that table exists to provide — and making a typo in a call
-- note permanent.
--
-- WHY THIS IS NOT users.admin_notes. That column is one blob per client,
-- overwritten on every edit, with no author, timestamp or subject. It stays
-- where it is as the admin's standing summary of a client; this table is the
-- chronological record of individual interactions. The first is a paragraph
-- you revise, the second is a log you append to.
--
-- STATUS COLUMN NOTE: `type` uses `text ... check (... in (...))`, matching
-- every other enumerated column in this schema — never a native Postgres
-- `create type ... as enum`, for the reasons set out in
-- 0005_construction_and_visa.sql. Unlike documents.category in 0010 this one
-- DOES carry a check: the five interaction types are a genuinely closed set
-- (a thing either happened by phone or it did not), whereas document
-- categories are business vocabulary expected to churn.

create table public.activities (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  entity_type         text not null,
  entity_id           text not null,
  type                text not null check (type in ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK')),
  subject             text not null,
  body                text,
  -- Separate from created_at on purpose: someone logging Friday's call on
  -- Monday needs the timeline to place it on Friday. See the occurredAt doc
  -- comment in prisma/schema.prisma.
  occurred_at         timestamptz,
  due_at              timestamptz,
  completed_at        timestamptz,
  created_by_user_id  text not null references public.users(clerk_user_id) on delete cascade,
  visible_to_client   boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index activities_tenant_id_idx on public.activities(tenant_id);
create index activities_entity_idx on public.activities(entity_type, entity_id);
-- Backs the open-tasks query, which filters on completion and orders by due
-- date across every entity at once rather than within one record.
create index activities_tenant_due_idx on public.activities(tenant_id, due_at);

alter table public.activities enable row level security;

-- Same template as documents in 0010: a client sees only what was
-- deliberately shared, admins see everything in their tenant, and only admins
-- may write. As with every policy in this project these are not what protects
-- the application today — Prisma bypasses RLS entirely (ARCHITECTURE.md) —
-- they are kept correct so they become live again if anything ever reads this
-- database through PostgREST.
create policy activities_select on public.activities
  for select using (
    tenant_id = app.current_tenant_id()
    and (app.is_admin() or visible_to_client)
  );

create policy activities_admin_insert on public.activities
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());

create policy activities_admin_update on public.activities
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy activities_admin_delete on public.activities
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());
