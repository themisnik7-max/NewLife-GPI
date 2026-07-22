/**
 * Plain TS const, not a Prisma-generated enum — User.role is a Prisma
 * `String` column (see the long comment on User.role in prisma/schema.prisma
 * for why: Prisma 7's "prisma-client" generator requires a real native
 * Postgres enum type for any Prisma `enum` field, which this project's
 * `text + check` migrations never created). Shaped identically to what
 * Prisma used to generate here, so every existing `Role.ADMIN`/`Role.TENANT`
 * call site is unchanged — only the import path moved.
 */
export const Role = {
  ADMIN: "ADMIN",
  TENANT: "TENANT",
  INVESTOR: "INVESTOR",
} as const;

export type Role = (typeof Role)[keyof typeof Role];
