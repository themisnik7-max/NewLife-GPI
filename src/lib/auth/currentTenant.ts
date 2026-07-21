import "server-only";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

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
