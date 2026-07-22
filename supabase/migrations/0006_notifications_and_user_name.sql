-- Adds users.first_name/last_name (synced from Clerk webhook payload's
-- data.first_name/data.last_name, previously never captured) and the
-- notifications table backing the TopNav bell, matching
-- prisma/schema.prisma's User.firstName/lastName and Notification model.

alter table public.users
  add column if not exists first_name text,
  add column if not exists last_name text;

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    text not null references public.users(clerk_user_id) on delete cascade,
  message    text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_tenant_id_idx on public.notifications(tenant_id);
create index notifications_user_id_idx on public.notifications(user_id);

alter table public.notifications enable row level security;

-- A user sees only their own notifications; admins see every notification
-- in their tenant — same shape as payment_ledger_select/visa_steps_select.
create policy notifications_select on public.notifications
  for select using (
    tenant_id = app.current_tenant_id()
    and (user_id = app.current_clerk_user_id() or app.is_admin())
  );

-- Unlike payment_ledger/visa_steps, the owning user (not just an admin) can
-- update their own row — marking a notification read is the user's own
-- action, not an admin-controlled one. Creation happens server-side via
-- Prisma (bypasses RLS entirely, see ARCHITECTURE.md), so no insert policy
-- is defined for the client path — the absence is deliberate, matching
-- ai_logs_admin_select's write-side reasoning in 0001_init.sql.
create policy notifications_update_own on public.notifications
  for update using (
    tenant_id = app.current_tenant_id()
    and (user_id = app.current_clerk_user_id() or app.is_admin())
  )
  with check (tenant_id = app.current_tenant_id());

create policy notifications_admin_delete on public.notifications
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());
