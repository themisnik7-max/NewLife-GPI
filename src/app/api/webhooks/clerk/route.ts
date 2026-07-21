import { NextResponse } from "next/server";
import { Webhook } from "svix";
import type { UserWebhookEvent } from "@clerk/nextjs/webhooks";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/client";

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

  let evt: UserWebhookEvent;
  try {
    evt = new Webhook(webhookSecret).verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as UserWebhookEvent;
  } catch (err) {
    console.error("Clerk webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Acknowledge every event type other than user.created/user.updated so
  // Clerk doesn't keep retrying delivery — this endpoint just has nothing to
  // do for them yet (e.g. user.deleted is intentionally not handled here).
  if (evt.type !== "user.created" && evt.type !== "user.updated") {
    return NextResponse.json({ received: true });
  }

  const { data } = evt;
  const clerkId = data.id;
  const incomingEventTime = new Date(data.updated_at ?? Date.now());

  // Everything from here down touches an external payload's shape and/or
  // the database — either can fail in ways a compile-time type assertion
  // (`as UserWebhookEvent` above only asserts a shape, svix only verifies a
  // signature; neither guarantees the payload actually matches at runtime)
  // can't prevent. Catching broadly here means a malformed payload or a
  // transient DB error produces a clean 500 — which tells Clerk to retry —
  // instead of an unhandled exception surfacing as an opaque framework
  // error with no logged cause.
  try {
    const primaryEmail =
      data.email_addresses.find((email) => email.id === data.primary_email_address_id) ??
      data.email_addresses[0];

    if (!primaryEmail) {
      return NextResponse.json({ error: "User has no email address" }, { status: 400 });
    }

    const role = resolveRole(data.public_metadata);

    const existingUser = await prisma.user.findUnique({
      where: { id: clerkId },
      select: { lastSyncedAt: true },
    });

    if (existingUser) {
      // Clerk guarantees at-least-once delivery, not ordered delivery: a
      // delayed user.created can arrive after a newer user.updated already
      // landed (e.g. a role change). Comparing against the stored
      // lastSyncedAt — the payload's own event time, not our own write
      // clock — is what makes this "skip if not newer" rather than "skip if
      // duplicate": it protects against both an exact duplicate redelivery
      // and a genuinely older event arriving late.
      if (existingUser.lastSyncedAt && existingUser.lastSyncedAt >= incomingEventTime) {
        return NextResponse.json({ received: true, skipped: "stale event" });
      }

      await prisma.user.update({
        where: { id: clerkId },
        data: { email: primaryEmail.email_address, role, lastSyncedAt: incomingEventTime },
      });
    } else {
      // True 1:1 user-to-tenant provisioning: every genuinely new Clerk user
      // gets their own fresh Tenant, keyed on a randomly generated UUID —
      // regardless of whether the event that got us into this branch was
      // literally user.created or an out-of-order user.updated that arrived
      // first for a user we've never seen. There is no shared default
      // tenant anymore.
      //
      // The interactive (callback) transaction form matters here, not just
      // the array form: if a concurrent duplicate delivery already inserted
      // this same user between the findUnique above and this write,
      // tx.user.create()'s primary-key conflict throws inside the callback,
      // and Prisma rolls back the *entire* transaction — including the
      // tx.tenant.create() that already ran — rather than leaving an
      // orphaned Tenant row that no User ever ends up pointing at. The
      // outer try/catch turns that rollback into a 500; Clerk's retry then
      // finds the user already exists and takes the update branch above.
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
            tenantId: newTenantId,
            lastSyncedAt: incomingEventTime,
          },
        });
      });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Clerk webhook processing failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
