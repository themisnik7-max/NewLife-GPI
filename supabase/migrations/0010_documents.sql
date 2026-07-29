-- Adds public.documents — the general-purpose file store behind the
-- monday-style Files panel that now appears on properties, clients, payments
-- and construction milestones. Matches prisma/schema.prisma's Document model
-- and is consumed by src/lib/data/documents.ts.
--
-- RELATIONSHIP TO rental_stage_records.attachment_path (0008): that column
-- stays exactly as it is. It models the ONE document that evidences ONE
-- workflow stage — a one-to-one slot with a per-stage content-type rule that
-- the stage tracker renders inline. This table models "every file attached to
-- this record", which is many-to-one with no slot rule. Both write into the
-- same private storage bucket; neither supersedes the other. See the Document
-- doc comment in the Prisma schema for the full reasoning.
--
-- CATEGORY COLUMN NOTE: `category` deliberately has NO check constraint, the
-- same decision as rental_stage_records.stage_key in 0008 and for the same
-- reason — the category list is business vocabulary, expected to change, and
-- a check would turn every revision into a migration. It is validated in
-- application code against the canonical list in src/lib/documents.ts on
-- write. This is the opposite call from users.role/properties.status, which
-- are genuinely closed sets and do carry checks.
--
-- entity_type/entity_id are plain text rather than real FKs, matching
-- audit_logs in 0008: a typed relation would need one nullable FK column per
-- attachable table. The tradeoff (entity_id is not referentially enforced) is
-- accepted here for a second reason beyond the audit-log one — deleting a
-- property should not silently destroy the signed contracts filed against it
-- before someone has decided what to do with them.

create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  entity_type        text not null,
  entity_id          text not null,
  category           text not null,
  storage_path       text not null,
  filename           text not null,
  content_type       text not null,
  size_bytes         integer not null,
  description        text,
  -- Defaults false: a file is internal unless an admin deliberately shares
  -- it. See the visibleToClient doc comment in prisma/schema.prisma for why
  -- this direction of default is load-bearing rather than incidental.
  visible_to_client  boolean not null default false,
  uploaded_by_user_id text not null references public.users(clerk_user_id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index documents_tenant_id_idx on public.documents(tenant_id);
create index documents_entity_idx on public.documents(entity_type, entity_id);

alter table public.documents enable row level security;

-- Same four-policy template as rental_stage_records in 0008, with one
-- addition: the client-facing select is further narrowed by
-- visible_to_client. These policies are not what protects the application
-- today (Prisma bypasses RLS — see ARCHITECTURE.md "Data access: Prisma
-- only"); they are kept correct and in place so they become live again if
-- anything ever reads this database through PostgREST.
create policy documents_select on public.documents
  for select using (
    tenant_id = app.current_tenant_id()
    and (app.is_admin() or visible_to_client)
  );

create policy documents_admin_insert on public.documents
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());

create policy documents_admin_update on public.documents
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy documents_admin_delete on public.documents
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());
