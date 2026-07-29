-- Adds public.automation_rules — the "when X, do Y" recipes behind the
-- automations page. Matches prisma/schema.prisma's AutomationRule model and
-- is consumed by src/lib/data/automations.ts.
--
-- WHY A TABLE RATHER THAN HARD-CODED RULES: the conditions a business wants
-- to watch change constantly ("chase after 7 days" becomes "after 4 days" the
-- first time a deal is lost). Storing them turns each such change from a
-- deployment into an admin action.
--
-- EVALUATION IS PULL, NOT PUSH — no triggers, no NOTIFY, nothing fires on
-- write. Rules are evaluated when runAutomations() is called, from the
-- admin's button or from an authenticated route handler a scheduler hits.
-- Two reasons, both load-bearing: a rule that fires inside a write
-- transaction can fail the write it was observing, and the interesting
-- triggers here are time-based ("nothing has happened for 7 days"), which
-- have no write to hang off — the moment worth acting on is precisely the
-- moment nothing happened.
--
-- `trigger` and `action` DO carry check constraints, unlike documents.category
-- in 0010. These are not business vocabulary: the engine has to know how to
-- evaluate each trigger and perform each action, so an unrecognised value is
-- a bug, not a new category. Same reasoning as deals.stage in 0013.

create table public.automation_rules (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  name                text not null,
  trigger             text not null check (trigger in (
                        'DEAL_STALLED', 'DEAL_CLOSE_DATE_PASSED',
                        'PAYMENT_OVERDUE', 'TASK_OVERDUE',
                        'RENTAL_STAGE_STALLED', 'VISA_STEP_STALLED')),
  -- Nullable: some triggers ("a payment is overdue") need no threshold.
  threshold_days      integer check (threshold_days is null or threshold_days > 0),
  action              text not null check (action in ('NOTIFY', 'CREATE_TASK')),
  message_template    text not null,
  enabled             boolean not null default true,
  -- Stored rather than derived: scanning notifications to guess when a rule
  -- last did something cannot distinguish "never matched" from "never ran".
  last_run_at         timestamptz,
  last_match_count    integer,
  created_by_user_id  text not null references public.users(clerk_user_id) on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index automation_rules_tenant_id_idx on public.automation_rules(tenant_id);

alter table public.automation_rules enable row level security;

-- Admin-only, with no client-facing select policy: an automation rule is
-- internal operational configuration, and its message templates describe how
-- the business chases its own clients. Same shape as contacts/deals in 0013.
create policy automation_rules_admin_select on public.automation_rules
  for select using (app.is_admin() and tenant_id = app.current_tenant_id());
create policy automation_rules_admin_insert on public.automation_rules
  for insert with check (app.is_admin() and tenant_id = app.current_tenant_id());
create policy automation_rules_admin_update on public.automation_rules
  for update using (app.is_admin() and tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());
create policy automation_rules_admin_delete on public.automation_rules
  for delete using (app.is_admin() and tenant_id = app.current_tenant_id());
