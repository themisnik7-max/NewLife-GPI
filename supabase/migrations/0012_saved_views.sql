-- Adds public.saved_views — named, reusable table configurations, as
-- monday's saved board views are. Matches prisma/schema.prisma's SavedView
-- model and is consumed by src/lib/data/savedViews.ts.
--
-- PER USER, NOT PER TENANT, and that is the design rather than an oversight.
-- Two admins looking at the same client roster want different working sets,
-- and a shared view that one of them silently re-sorts is worse than no saved
-- views at all. Sharing with a colleague is a feature this deliberately does
-- not have yet; adding it later means adding a nullable shared_with_tenant
-- flag, not unpicking an ownership model.
--
-- WHY config IS jsonb AND NOT TYPED COLUMNS: the filter/sort/group shape is
-- defined and validated in application code (parseViewConfig in
-- src/lib/views.ts), which drops anything it does not recognise. Typed
-- columns would make every change to the filter model a migration, for data
-- that is only ever read back by the one function that wrote it. The
-- tradeoff — the database cannot validate this column — is accepted because
-- a malformed config degrades to a partial view rather than corrupting
-- anything.
--
-- `scope` deliberately has NO check constraint, the same call as
-- documents.category in 0010: the set of tables grows as the app does.

create table public.saved_views (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    text not null references public.users(clerk_user_id) on delete cascade,
  scope      text not null,
  name       text not null,
  config     jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One name per user per table: saving over an existing name is an update,
  -- not a second row that shadows the first in the list.
  unique (user_id, scope, name)
);

create index saved_views_tenant_id_idx on public.saved_views(tenant_id);
create index saved_views_user_scope_idx on public.saved_views(user_id, scope);

alter table public.saved_views enable row level security;

-- Unlike every other table in this schema, these policies are keyed on the
-- OWNER rather than on admin role: a saved view is personal working state,
-- so even an admin has no business reading or rewriting someone else's. That
-- makes this the one table where `app.is_admin()` deliberately does not
-- appear. As everywhere else, RLS is not what protects the application today
-- (Prisma bypasses it — see ARCHITECTURE.md); these are kept correct so they
-- become live again if anything ever reads through PostgREST.
create policy saved_views_own_select on public.saved_views
  for select using (
    tenant_id = app.current_tenant_id() and user_id = app.current_clerk_user_id()
  );

create policy saved_views_own_insert on public.saved_views
  for insert with check (
    tenant_id = app.current_tenant_id() and user_id = app.current_clerk_user_id()
  );

create policy saved_views_own_update on public.saved_views
  for update using (
    tenant_id = app.current_tenant_id() and user_id = app.current_clerk_user_id()
  )
  with check (tenant_id = app.current_tenant_id());

create policy saved_views_own_delete on public.saved_views
  for delete using (
    tenant_id = app.current_tenant_id() and user_id = app.current_clerk_user_id()
  );
