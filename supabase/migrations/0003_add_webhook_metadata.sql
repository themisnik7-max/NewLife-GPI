-- Adds last_synced_at to public.users, matching prisma/schema.prisma's new
-- User.lastSyncedAt field — tracks the Clerk webhook event time (payload's
-- own data.updated_at) that last wrote each row, so the webhook handler can
-- detect and skip an out-of-order/delayed event instead of letting it
-- overwrite a newer one.
--
-- Nullable, no backfill: existing rows get NULL, which the application
-- treats as "no prior sync recorded — always process the next update,"
-- never as "stale." No default value is semantically correct here (there is
-- no real prior sync time to backfill), unlike the label/masked_key columns
-- in 0002_api_key_sync.sql, which needed one because they were made NOT
-- NULL. This column stays nullable, so a plain single-step add is safe on a
-- non-empty table.
alter table public.users
  add column if not exists last_synced_at timestamptz;
