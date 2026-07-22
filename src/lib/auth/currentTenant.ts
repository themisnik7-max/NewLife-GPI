import "server-only";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/auth/role";

/**
 * Resolves the signed-in user's real database tenant UUID, server-side.
 *
 * This is deliberately NOT what `useTenant()` (src/hooks/useTenant.ts)
 * returns — that hook gives back `orgId ?? userId`, which are Clerk-format
 * string ids (e.g. "org_..."/"user_..."), never a Postgres UUID. Prisma
 * queries run over a direct Postgres connection and are not subject to
 * Supabase RLS at all (RLS only applies to requests made through
 * PostgREST/the Supabase client, using auth.jwt()) — so every Prisma query
 * that touches tenant-scoped data must resolve and filter by this real
 * tenant_id itself; RLS will not save it.
 */
export async function getCurrentTenantId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });

  return user?.tenantId ?? null;
}

export interface CurrentUser {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
  name: string;
  initials: string;
}

function buildInitials(firstName: string | null, lastName: string | null, email: string): string {
  const first = firstName?.trim()?.[0];
  const last = lastName?.trim()?.[0];
  if (first && last) return `${first}${last}`.toUpperCase();
  if (first) return first.toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

const VALID_ROLES: ReadonlySet<string> = new Set(Object.values(Role));

/**
 * users.role is a Prisma `String` column (see the long note on it in
 * prisma/schema.prisma), so Prisma types it as plain `string`, not the
 * narrower Role union — even though the database's own check constraint
 * already guarantees it's one of the three real values. This makes that
 * guarantee visible to TypeScript too, and fails loudly rather than
 * silently mistyping a row on the (currently unreachable, but not
 * type-system-prevented) chance of a bad value.
 */
function toRole(rawRole: string): Role {
  if (!VALID_ROLES.has(rawRole)) {
    throw new Error(`Unrecognized role value from database: ${rawRole}`);
  }
  return rawRole as Role;
}

/**
 * Resolves the signed-in user's full identity (tenant, role, display name) in
 * one query — used anywhere the UI needs to show who is actually signed in
 * (TopNav's identity chip, role-gated pages) rather than the hardcoded
 * "Maria Papadopoulos" placeholder every page previously used regardless of
 * who was really logged in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true, role: true, email: true, firstName: true, lastName: true },
  });
  if (!user) return null;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;

  return {
    userId,
    tenantId: user.tenantId,
    role: toRole(user.role),
    email: user.email,
    name,
    initials: buildInitials(user.firstName, user.lastName, user.email),
  };
}
