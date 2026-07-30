import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAutomations } from "@/lib/data/automations";
import { Role } from "@/lib/auth/role";

/**
 * Scheduled entry point for the automation engine.
 *
 * Exists so a scheduler (Vercel Cron, an external pinger, anything that can
 * make an authenticated GET) can drive the rules without a person clicking a
 * button. The engine itself is the same one the button calls — there is
 * deliberately no second code path, because a scheduled run that behaves
 * differently from the one an admin tested is the bug this route would
 * otherwise introduce.
 *
 * ⚠️ THIS ROUTE HAS NO CLERK SESSION, so the usual role check cannot apply.
 * It is protected by a shared secret in `AUTOMATION_RUN_SECRET` compared in
 * constant time. Three consequences, all deliberate:
 *
 *  - With the variable unset the route returns 503 and does nothing. It
 *    fails closed: an unset secret must never mean "no authentication
 *    required", which is exactly what a `!secret || ...` check would give.
 *  - The actor recorded for anything the run creates is the tenant's own
 *    first admin, not a synthetic system user. Every audit and activity row
 *    in this schema has a real `users.clerk_user_id` foreign key, and
 *    inventing an id to satisfy it would break that constraint.
 *  - It iterates every tenant, so one schedule serves the whole deployment.
 *    That is the one thing in this codebase that legitimately crosses the
 *    tenant boundary, and it does so by looping over tenants and scoping
 *    each run to one — never by running an unscoped query.
 */

export const dynamic = "force-dynamic";

/**
 * Compares two secrets without leaking their relationship through timing.
 *
 * A plain `===` on a secret returns as soon as it finds a differing byte,
 * which is measurable. Length is compared first and separately because the
 * loop below cannot be constant-time across different lengths anyway.
 */
function secretsMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;

  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.AUTOMATION_RUN_SECRET;

  if (!expected) {
    // Fails closed. An unset secret is a deployment that has not been
    // configured for scheduled runs, not one that permits anonymous ones.
    return NextResponse.json(
      { error: "Scheduled automation runs are not configured." },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const report: Array<{ tenantId: string; rules: number; delivered: number }> = [];

  for (const tenant of tenants) {
    // Every write the engine performs is attributed to a real admin of the
    // tenant it acts on — the FK on audit_logs.actor_user_id and
    // activities.created_by_user_id both require one.
    const admin = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: Role.ADMIN },
      select: { id: true },
    });
    if (!admin) continue;

    try {
      const results = await runAutomations({ tenantId: tenant.id, actorUserId: admin.id });
      report.push({
        tenantId: tenant.id,
        rules: results.length,
        delivered: results.reduce((sum, result) => sum + result.delivered, 0),
      });
    } catch (err) {
      // One tenant's failure must not stop the rest — the same reasoning as
      // the per-rule isolation inside runAutomations().
      console.error(`Scheduled automation run failed for tenant ${tenant.id}:`, err);
    }
  }

  return NextResponse.json({ ran: report.length, report });
}
