import { NextResponse } from "next/server";
import { Webhook } from "svix";
import type {
  UserWebhookEvent,
  OrganizationWebhookEvent,
  OrganizationMembershipWebhookEvent,
} from "@clerk/nextjs/webhooks";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/auth/role";

type ClerkEvent = UserWebhookEvent | OrganizationWebhookEvent | OrganizationMembershipWebhookEvent;

// Verification here is done manually with `svix` directly (rather than
// `@clerk/nextjs`'s own `verifyWebhook()` convenience wrapper, which exists
// and uses `standardwebhooks` internally) to honor the explicit requirement
// to use the svix library against `CLERK_WEBHOOK_SECRET` by that exact name.
// Note Clerk's own SDK reads a differently-named env var by default
// (`CLERK_WEBHOOK_SIGNING_SECRET`) if you switch to `verifyWebhook()` later.

function resolveRole(publicMetadata: Record<string, unknown> | null | undefined): Role {
  const rawRole = publicMetadata?.role;

  if (typeof rawRole !== "string") {
    if (rawRole !== undefined && rawRole !== null) {
      console.warn(`Unrecognized publicMetadata.role value, defaulting to TENANT: ${JSON.stringify(rawRole)}`);
    }
    return Role.TENANT;
  }

  const normalizedRole = rawRole.toLowerCase();
  if (normalizedRole === "admin") {
    return Role.ADMIN;
  }
  if (normalizedRole !== "tenant") {
    console.warn(`Unrecognized publicMetadata.role value, defaulting to TENANT: ${JSON.stringify(rawRole)}`);
  }
  return Role.TENANT;
}

// Clerk allows an org to define custom role keys beyond its own defaults,
// which is why OrganizationMembershipJSON types `role` as a plain string —
// this only ever recognizes the two built-in ones, same defensive
// default-to-TENANT-with-a-warning style as resolveRole() above.
function resolveMembershipRole(rawRole: string): Role {
  const normalizedRole = rawRole.toLowerCase();
  if (normalizedRole === "org:admin") {
    return Role.ADMIN;
  }
  if (normalizedRole !== "org:member") {
    console.warn(`Unrecognized organization membership role, defaulting to TENANT: ${JSON.stringify(rawRole)}`);
  }
  return Role.TENANT;
}

export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET is not set — refusing to process webhook.");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await req.text();

  let evt: ClerkEvent;
  try {
    evt = new Webhook(webhookSecret).verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch (err) {
    console.error("Clerk webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Everything from here down touches an external payload's shape and/or
  // the database — either can fail in ways a compile-time type assertion
  // (`as ClerkEvent` above only asserts a shape, svix only verifies a
  // signature; neither guarantees the payload actually matches at runtime)
  // can't prevent. Catching broadly here means a malformed payload or a
  // transient DB error produces a clean 500 — which tells Clerk to retry —
  // instead of an unhandled exception surfacing as an opaque framework
  // error with no logged cause.
  //
  // A switch on evt.type (rather than a chain of `if`s with early returns)
  // is deliberate: TypeScript only narrows evt's payload type per-case here
  // because organization.created/.updated share one member of the
  // OrganizationWebhookEvent union whose own `type` field is itself a
  // two-value union — a chain of individual `!==` checks combined with `&&`
  // cannot get TypeScript to conclude the whole disjunction is covered the
  // way a switch's exhaustiveness checking can.
  try {
    switch (evt.type) {
      case "organization.created": {
        const { data } = evt;

        // Idempotent, not a bare create: Clerk/Svix is at-least-once
        // delivery, so this event WILL be redelivered in normal operation —
        // a bare create would hit the clerkOrgId unique constraint on every
        // redelivery and retry forever instead of settling.
        await prisma.tenant.upsert({
          where: { clerkOrgId: data.id },
          create: { id: crypto.randomUUID(), name: data.name, clerkOrgId: data.id },
          update: {},
        });

        return NextResponse.json({ received: true });
      }

      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const { data } = evt;
        const incomingEventTime = new Date(data.updated_at ?? Date.now());
        const targetUserId = data.public_user_data.user_id;

        const existingUser = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { orgMembershipSyncedAt: true },
        });

        if (!existingUser) {
          // A genuine delivery-order race (this membership event beat the
          // target's own user.created), but unlike that race, not
          // self-healing — nothing else will ever recreate this exact User
          // row, so this relies on Clerk/Svix's retry window rather than
          // synthesizing one from public_user_data, whose `identifier`
          // field is polymorphic (email/phone/username) and not a safe
          // stand-in for the real email_addresses shape user.created needs.
          throw new Error(`organizationMembership event for unknown user ${targetUserId}`);
        }

        if (existingUser.orgMembershipSyncedAt && existingUser.orgMembershipSyncedAt >= incomingEventTime) {
          return NextResponse.json({ received: true, skipped: "stale event" });
        }

        // Upserting the tenant here too (not only in organization.created)
        // closes the one race that ISN'T self-healing: a membership event
        // arriving before its organization.created counterpart has nothing
        // else that will ever retry it once Svix's retry window lapses, and
        // a persistently-failing endpoint risks Svix disabling delivery
        // entirely. Deriving it from data.organization (fully embedded in
        // this payload) removes that dependency outright.
        const tenant = await prisma.tenant.upsert({
          where: { clerkOrgId: data.organization.id },
          create: { id: crypto.randomUUID(), name: data.organization.name, clerkOrgId: data.organization.id },
          update: {},
        });

        await prisma.user.update({
          where: { id: targetUserId },
          data: {
            tenantId: tenant.id,
            role: resolveMembershipRole(data.role),
            orgMembershipSyncedAt: incomingEventTime,
          },
        });

        return NextResponse.json({ received: true });
      }

      case "organizationMembership.deleted": {
        const { data } = evt;
        const incomingEventTime = new Date(data.updated_at ?? Date.now());
        const targetUserId = data.public_user_data.user_id;

        const existingUser = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { orgMembershipSyncedAt: true },
        });

        if (!existingUser) {
          return NextResponse.json({ received: true, skipped: "unknown user" });
        }

        if (existingUser.orgMembershipSyncedAt && existingUser.orgMembershipSyncedAt >= incomingEventTime) {
          return NextResponse.json({ received: true, skipped: "stale event" });
        }

        // A removed member can't keep tenantId pointed at the org's tenant —
        // that would leak the rest of the org's data to them through their
        // now-stale tenantId. Give them back a fresh personal tenant
        // instead, mirroring user.created's own bootstrap shape below
        // exactly.
        const newTenantId = crypto.randomUUID();

        await prisma.$transaction(async (tx) => {
          await tx.tenant.create({
            data: { id: newTenantId, name: `User Tenant - ${targetUserId}` },
          });
          await tx.user.update({
            where: { id: targetUserId },
            data: {
              tenantId: newTenantId,
              role: Role.TENANT,
              orgMembershipSyncedAt: incomingEventTime,
            },
          });
        });

        return NextResponse.json({ received: true });
      }

      case "user.created":
      case "user.updated": {
        const { data } = evt;
        const clerkId = data.id;
        const incomingEventTime = new Date(data.updated_at ?? Date.now());

        const primaryEmail =
          data.email_addresses.find((email) => email.id === data.primary_email_address_id) ??
          data.email_addresses[0];

        if (!primaryEmail) {
          return NextResponse.json({ error: "User has no email address" }, { status: 400 });
        }

        const role = resolveRole(data.public_metadata);

        const existingUser = await prisma.user.findUnique({
          where: { id: clerkId },
          select: { lastSyncedAt: true, tenant: { select: { clerkOrgId: true } } },
        });

        if (existingUser) {
          // Clerk guarantees at-least-once delivery, not ordered delivery: a
          // delayed user.created can arrive after a newer user.updated
          // already landed (e.g. a role change). Comparing against the
          // stored lastSyncedAt — the payload's own event time, not our own
          // write clock — is what makes this "skip if not newer" rather
          // than "skip if duplicate": it protects against both an exact
          // duplicate redelivery and a genuinely older event arriving late.
          if (existingUser.lastSyncedAt && existingUser.lastSyncedAt >= incomingEventTime) {
            return NextResponse.json({ received: true, skipped: "stale event" });
          }

          // Once a tenant is org-backed, organization membership owns role —
          // resolveRole() silently defaults to TENANT whenever
          // public_metadata.role is unset, which is always true for an
          // org-derived admin (their adminhood comes from membership, not
          // metadata). Without this guard, the next unrelated profile edit
          // (e.g. a name change) would silently demote them back to TENANT.
          const isOrgBacked = existingUser.tenant.clerkOrgId !== null;

          await prisma.user.update({
            where: { id: clerkId },
            data: {
              email: primaryEmail.email_address,
              ...(isOrgBacked ? {} : { role }),
              firstName: data.first_name,
              lastName: data.last_name,
              lastSyncedAt: incomingEventTime,
            },
          });
        } else {
          // True 1:1 user-to-tenant provisioning: every genuinely new Clerk
          // user gets their own fresh Tenant, keyed on a randomly generated
          // UUID — regardless of whether the event that got us into this
          // branch was literally user.created or an out-of-order
          // user.updated that arrived first for a user we've never seen.
          // There is no shared default tenant anymore.
          //
          // The interactive (callback) transaction form matters here, not
          // just the array form: if a concurrent duplicate delivery already
          // inserted this same user between the findUnique above and this
          // write, tx.user.create()'s primary-key conflict throws inside
          // the callback, and Prisma rolls back the *entire* transaction —
          // including the tx.tenant.create() that already ran — rather than
          // leaving an orphaned Tenant row that no User ever ends up
          // pointing at. The outer try/catch turns that rollback into a
          // 500; Clerk's retry then finds the user already exists and takes
          // the update branch above.
          const newTenantId = crypto.randomUUID();

          await prisma.$transaction(async (tx) => {
            await tx.tenant.create({
              data: { id: newTenantId, name: `User Tenant - ${clerkId}` },
            });
            await tx.user.create({
              data: {
                id: clerkId,
                email: primaryEmail.email_address,
                role,
                firstName: data.first_name,
                lastName: data.last_name,
                tenantId: newTenantId,
                lastSyncedAt: incomingEventTime,
              },
            });
          });
        }

        return NextResponse.json({ received: true });
      }

      default:
        // Everything else (user.deleted, organization.updated/.deleted, and
        // any other Clerk event type this endpoint isn't subscribed to) is
        // acknowledged so Clerk doesn't keep retrying delivery for events
        // this endpoint has nothing to do for.
        return NextResponse.json({ received: true });
    }
  } catch (err) {
    console.error("Clerk webhook processing failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
