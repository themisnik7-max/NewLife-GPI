"use client";

import { useOrganization, CreateOrganization, OrganizationProfile } from "@clerk/nextjs";

// Keeps Clerk's own default theme from clashing with the app's stone/aegean
// palette used everywhere else — a light touch, not a full re-skin.
const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "#0369a1", // aegean-700
    colorText: "#292524", // stone-800
    borderRadius: "0.5rem",
  },
};

/**
 * Admin-only "Team" page content. An admin with no Clerk Organization yet
 * sees CreateOrganization (one-time, one click — becomes org:admin
 * automatically); once one exists, OrganizationProfile takes over and
 * provides member list, invite-by-email, pending invitations, and
 * per-member role management out of the box — no custom invite form or
 * email delivery is being built here. Both use routing="hash" so they work
 * inside this single route without a Next.js catch-all segment.
 */
export function TeamOrganizationPanel() {
  const { isLoaded, organization } = useOrganization();

  if (!isLoaded) {
    return null;
  }

  if (!organization) {
    return (
      <div className="flex justify-center">
        <CreateOrganization routing="hash" appearance={CLERK_APPEARANCE} />
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <OrganizationProfile routing="hash" appearance={CLERK_APPEARANCE} />
    </div>
  );
}
