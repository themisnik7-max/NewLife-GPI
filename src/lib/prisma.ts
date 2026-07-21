import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7's new "prisma-client" generator requires an explicit driver
// adapter rather than resolving DATABASE_URL implicitly — confirmed by
// running `tsc`, which failed with "Expected 1 arguments, but got 0" on a
// bare `new PrismaClient()` before this adapter was added.
const adapter = new PrismaPg(process.env.DATABASE_URL!);

// Standard Next.js singleton pattern: caches the client on `globalThis` in
// development so Fast Refresh (which re-evaluates modules on every save)
// reuses one client instead of opening a new connection pool per reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
