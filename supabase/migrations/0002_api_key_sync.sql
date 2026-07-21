-- NewLife GPI — realign encrypted_api_keys with ApiKeyCard.tsx's actual
-- prop requirements (label, status, maskedKey), which don't exist on the
-- raw-cryptographic-only shape from 0001_init.sql.
--
-- `status` has a real, safe default ('ACTIVE') that is semantically correct
-- for every pre-existing row too (any key that already existed and was
-- being used must have been active), so it's added as NOT NULL with a
-- DEFAULT in one statement — safe and non-rewriting on modern Postgres.
--
-- `label` and `masked_key` have no such natural default — backfilling them
-- with a real value for pre-existing rows isn't possible without knowing
-- what they should say (label is free text the user chose; masked_key
-- requires the real secret's suffix, which is never available outside the
-- encrypted blob). Both are added nullable, backfilled with an explicit
-- placeholder that is honest about being one, then locked to NOT NULL —
-- this is the standard safe pattern for adding a required column to a table
-- that may already hold rows, and is what "without losing existing
-- operational data" requires: no row is dropped or rewritten destructively.

alter table public.encrypted_api_keys
  add column if not exists status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'REVOKED'));

alter table public.encrypted_api_keys
  add column if not exists label text;

update public.encrypted_api_keys
  set label = 'Untitled key'
  where label is null;

alter table public.encrypted_api_keys
  alter column label set not null;

alter table public.encrypted_api_keys
  add column if not exists masked_key text;

update public.encrypted_api_keys
  set masked_key = '••••••••'
  where masked_key is null;

alter table public.encrypted_api_keys
  alter column masked_key set not null;
