"use server";

import { getCurrentUser } from "@/lib/auth/currentTenant";
import { Role } from "@/lib/auth/role";
import { searchTenant, type SearchResult } from "@/lib/data/search";

/**
 * The command palette's only server entry point.
 *
 * ADMIN-GATED HERE, not in the data layer — src/lib/data/search.ts documents
 * that it performs no role check of its own, so this function is the entire
 * guard on the widest read path in the application. A non-admin gets an empty
 * list rather than an error: the palette is admin-only UI they should never
 * see, and a thrown error would confirm the endpoint exists.
 *
 * The tenant id comes from the signed-in session, never from a parameter.
 */
export async function searchAction(query: string): Promise<SearchResult[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== Role.ADMIN) {
    return [];
  }

  return searchTenant(currentUser.tenantId, query);
}
