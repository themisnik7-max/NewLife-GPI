"use client";

import { useAuth } from "@clerk/nextjs";

export interface UseTenantResult {
  /**
   * The active organization's ID, or the signed-in user's own ID as a
   * single-tenant fallback when no organization is active. `null` while
   * auth state is still loading or the user is signed out.
   */
  tenantId: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

export function useTenant(): UseTenantResult {
  const { isLoaded, isSignedIn, userId, orgId } = useAuth();

  if (!isLoaded || !isSignedIn) {
    return { tenantId: null, isLoaded, isSignedIn: !!isSignedIn };
  }

  return { tenantId: orgId ?? userId, isLoaded: true, isSignedIn: true };
}
