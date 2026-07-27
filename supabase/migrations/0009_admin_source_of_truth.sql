-- Makes the admin account the system of record, per the product decision
-- that every client-facing page is a filtered view of data the admin owns.
-- Matches prisma/schema.prisma's new Property.listedForRental,
-- PropertyOwnership.saleDate/salePrice, and the User profile columns.
--
-- ADDITIVE ONLY. Unlike 0008, nothing here drops or rewrites existing data:
-- every column is nullable, or has a default that is genuinely correct for
-- every existing row (listed_for_rental = false means "for sale", which is
-- what every current property is). There is deliberately NO backfill of
-- sale_date from created_at — see the note on that column below.
--
-- MONEY TYPE NOTE: sale_price is numeric(12, 2), matching
-- rental_stage_records.offer_price from 0008 rather than payment_ledger's
-- older double precision columns. Those are left alone; migrating them is a
-- separate change with its own rounding risk, not a side effect of this one.

-- ── Lettings inventory flag ──────────────────────────────────────────────
-- Before this, "which properties are we letting?" was unanswerable: the ten
-- stage records from 0008 hang off a user, so a property only became visible
-- as a rental after someone ticked its first stage. A unit that is for rent
-- but not yet started was invisible.
alter table public.properties
  add column if not exists listed_for_rental boolean not null default false;

-- Partial index, not a plain one: the admin Rentals page asks only for rows
-- where this is true, and that is expected to stay a small minority of the
-- table. Indexing the `false` majority would be dead weight.
create index if not exists properties_listed_for_rental_idx
  on public.properties(tenant_id)
  where listed_for_rental;

-- ── Real sale facts on the ownership row ─────────────────────────────────
-- created_at on this table is when an admin recorded the ownership in this
-- application. For a property sold before the app existed that is not the
-- date of sale, so these are separate columns and neither has to lie.
--
-- ⚠️ NO BACKFILL, deliberately. Copying created_at into sale_date would
-- manufacture a date nobody verified and would be indistinguishable from a
-- real one afterwards. Existing rows show "not recorded" until an admin
-- enters the true value.
alter table public.property_ownerships
  add column if not exists sale_date date,
  add column if not exists sale_price numeric(12, 2);

-- Guards the one invariant worth enforcing in the database: a negative or
-- zero sale price is always a data-entry error, never a real sale. Written
-- as a check rather than left to application code because this column is the
-- basis for revenue analysis, where a single bad row is silently corrosive.
alter table public.property_ownerships
  add constraint property_ownerships_sale_price_positive
  check (sale_price is null or sale_price > 0);

-- ── Admin-maintained client profile ──────────────────────────────────────
-- Stored here rather than in Clerk's publicMetadata: these have to be
-- joinable and aggregatable ("how many clients hold which nationality"),
-- which metadata on an external identity provider is not. first_name /
-- last_name / email stay Clerk-owned and webhook-synced — duplicating them
-- as editable columns would create two sources of truth that drift.
--
-- All nullable, no backfill: every existing client predates these columns
-- and there is no correct value to invent.
alter table public.users
  add column if not exists phone           text,
  add column if not exists nationality     text,
  add column if not exists passport_number text,
  add column if not exists date_of_birth   date,
  add column if not exists admin_notes     text;

-- ── RLS ──────────────────────────────────────────────────────────────────
-- No new policies. Every column above lives on a table that already has RLS
-- enabled with policies covering it (properties, property_ownerships, users
-- from 0001_init.sql) — Postgres policies are row-level, so added columns
-- are governed by the existing ones automatically.
--
-- IMPORTANT, and the reason this is spelled out rather than left implicit:
-- users_select in 0001 lets a client read their OWN user row, which now
-- includes admin_notes. RLS therefore does NOT keep admin notes away from
-- the client they describe. The application does: src/lib/data/clients.ts
-- exposes getClientProfile() (admin, includes notes) and
-- getOwnClientProfile() (client, omits them) as two separate functions so
-- the field cannot leak by someone reusing the wrong one. This is
-- application-level enforcement by necessity — the app reads exclusively
-- through Prisma, which bypasses RLS entirely (see ARCHITECTURE.md).
