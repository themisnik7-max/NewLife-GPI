-- Adds amount_paid to public.payment_ledger, matching prisma/schema.prisma's
-- new PaymentLedger.amountPaid field — tracks cumulative payment progress
-- toward an installment's `amount`, since PENDING/PAID/OVERDUE alone cannot
-- represent a partial payment. See src/lib/data/ledgers.ts's
-- recordTenantPayment() for how this is used.
--
-- Unlike last_synced_at in 0003 (nullable, no correct default to backfill),
-- every existing row genuinely has "zero paid so far" as its correct
-- starting value, so this is NOT NULL with a real default from the start —
-- a single-step add is safe on a non-empty table precisely because the
-- default applies to existing rows too, not just future inserts.
alter table public.payment_ledger
  add column if not exists amount_paid double precision not null default 0;
