-- Adds tenants.clerk_org_id (links a Tenant to a real Clerk Organization,
-- once one exists — see src/app/api/webhooks/clerk/route.ts's new
-- organization.created/organizationMembership.* handling) and
-- users.org_membership_synced_at (a staleness guard for that same event
-- stream, deliberately separate from users.last_synced_at, which tracks the
-- independent user.* event stream instead). Both nullable: every
-- pre-existing tenant/user predates Clerk Organizations being enabled at
-- all, and stays unlinked unless an admin actually creates one.

alter table public.tenants
  add column if not exists clerk_org_id text;

create unique index if not exists tenants_clerk_org_id_key
  on public.tenants(clerk_org_id);

alter table public.users
  add column if not exists org_membership_synced_at timestamptz;
