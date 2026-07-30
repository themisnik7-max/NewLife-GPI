-- Replaces the generic sales funnel on public.deals with the acquisition
-- funnel this business actually runs:
--
--     lead -> zoom meeting -> athens visit -> power of attorney -> buyer
--
-- WHY. 0013_pipeline.sql shipped NEW_LEAD / QUALIFIED / VIEWING / OFFER /
-- RESERVATION / CONTRACT / WON / LOST, taken from a standard B2B CRM
-- template. That is not this process. A Golden Visa purchase has no
-- "proposal" and no "reservation"; it has a video call, a trip to Athens, a
-- notarised power of attorney, and a completed purchase. Stages that do not
-- match the real process do not merely mislabel a board — they make every
-- conversion metric measure something nobody does. Confirmed directly with
-- the business owner on 2026-07-29; see BACKLOG.md section 4.4, decision D2.
--
-- ⚠️ THIS MIGRATION REMAPS DATA, IT DOES NOT DISCARD IT. Every old value is
-- given a destination below, with the reasoning stated per row. The
-- alternative — dropping the constraint and leaving old values in place —
-- would leave rows the application cannot render, because isKnownDealStage()
-- in src/lib/pipeline.ts rejects anything outside the new list.
--
-- ORDER MATTERS: the check constraint must come off BEFORE the data is
-- rewritten, and go back on after. Doing it the other way round fails on the
-- first updated row.

-- ── 1. Release the old constraint ────────────────────────────────────────
-- Named implicitly by Postgres when 0013 declared `check (stage in (...))`
-- inline, so it is found by pattern rather than by a name we chose. The
-- DO block keeps this idempotent: re-running the migration must not fail
-- because the constraint is already gone.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'deals'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%stage%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.deals drop constraint %I', constraint_name);
  end if;
end $$;

-- ── 2. Remap existing rows ───────────────────────────────────────────────
-- Each mapping is a judgement about where a deal genuinely sits in the real
-- funnel, not a mechanical rename:
--
--   NEW_LEAD, QUALIFIED  -> LEAD
--     Both mean "we are talking to this person and nothing has happened
--     yet". The distinction between them was never used.
--
--   VIEWING              -> ATHENS_VISIT
--     A viewing IS the Athens visit in this business. Nobody views a Greek
--     apartment remotely.
--
--   OFFER, RESERVATION   -> ATHENS_VISIT
--     Deliberately NOT mapped forward to POWER_OF_ATTORNEY. A POA is a
--     notarised instrument that either exists or does not, and no old row
--     can evidence one. Mapping optimistically would manufacture a legal
--     document in the data. Down-mapping understates progress, which is
--     recoverable by a human; claiming a POA that was never signed is not.
--
--   CONTRACT             -> POWER_OF_ATTORNEY
--     A deal at contract stage has, in practice, been through the POA step —
--     the purchase cannot be executed without it.
--
--   WON                  -> BUYER
--   LOST                 -> LOST
--     Direct equivalents.
update public.deals
set stage = case stage
  when 'NEW_LEAD'    then 'LEAD'
  when 'QUALIFIED'   then 'LEAD'
  when 'VIEWING'     then 'ATHENS_VISIT'
  when 'OFFER'       then 'ATHENS_VISIT'
  when 'RESERVATION' then 'ATHENS_VISIT'
  when 'CONTRACT'    then 'POWER_OF_ATTORNEY'
  when 'WON'         then 'BUYER'
  when 'LOST'        then 'LOST'
  -- Anything unrecognised falls back to the first stage rather than being
  -- left invalid, so the constraint below cannot fail on data written
  -- outside the application.
  else 'LEAD'
end
where stage not in ('LEAD', 'ZOOM_MEETING', 'ATHENS_VISIT', 'POWER_OF_ATTORNEY', 'BUYER', 'LOST');

-- ── 3. Reapply the constraint over the new vocabulary ────────────────────
-- Named explicitly this time so the next migration to touch it can drop it
-- by name instead of pattern-matching, as step 1 had to.
alter table public.deals
  add constraint deals_stage_check
  check (stage in ('LEAD', 'ZOOM_MEETING', 'ATHENS_VISIT', 'POWER_OF_ATTORNEY', 'BUYER', 'LOST'));

-- ── 4. Realign the default ───────────────────────────────────────────────
-- 0013 defaulted new deals to 'NEW_LEAD', which no longer exists.
alter table public.deals alter column stage set default 'LEAD';
