import "server-only";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/auth/role";
import type { Client } from "@/components/ui/ClientTable";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function toDisplayName(firstName: string | null, lastName: string | null, email: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || email;
}

/**
 * Fetches every non-admin user in a tenant, shaped for ClientTable — the
 * data behind the admin view of Overview (src/app/dashboard/page.tsx).
 *
 * `status` is always "Active": ClientTable's ClientStatus type also allows
 * "Onboarding"/"Pending documents"/"Inactive", carried over from the
 * original mock data, but nothing in this schema tracks any such lifecycle
 * today — there is no real signal to derive those other values from, so
 * showing them here would be fabricated, not "wrong data made honest."
 */
export async function getTenantClients(tenantId: string): Promise<Client[]> {
  const users = await prisma.user.findMany({
    where: { tenantId, role: Role.TENANT },
    orderBy: { createdAt: "desc" },
    include: {
      propertyOwnerships: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { property: true },
      },
    },
  });

  return users.map((user) => {
    const ownership = user.propertyOwnerships[0];
    return {
      id: user.id,
      name: toDisplayName(user.firstName, user.lastName, user.email),
      email: user.email,
      property: ownership ? `${ownership.property.name} — ${ownership.property.area}` : "No property assigned",
      status: "Active",
      joinedDate: dateFormatter.format(user.createdAt),
    };
  });
}
