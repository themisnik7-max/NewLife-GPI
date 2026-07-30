// Applies pending SQL migrations from supabase/migrations in filename order.
//
// WHY THIS EXISTS. The migrations in supabase/migrations are plain SQL applied
// by hand — this project does not use `prisma migrate`, because the schema was
// reconciled against an existing Supabase database rather than generated from
// Prisma (see the header of prisma/schema.prisma). Applying six files by
// copy-paste into the SQL editor is error-prone in exactly the way that
// matters: silently out of order.
//
// ⚠️ USES DIRECT_URL, NOT DATABASE_URL. DATABASE_URL points at Supabase's
// pooler (pgbouncer, port 6543) in transaction mode, which does not reliably
// support DDL or the multi-statement DO blocks migration 0015 uses. DIRECT_URL
// is the unpooled 5432 connection and is the correct one for schema changes.
//
// The connection string is never printed. Pass --dry-run to see what would be
// applied without touching the database.
//
// Usage:
//   node scripts/apply-migrations.mjs --dry-run
//   node scripts/apply-migrations.mjs
//   node scripts/apply-migrations.mjs --from 0013

import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATIONS_DIR = "supabase/migrations";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fromIndex = args.indexOf("--from");
const from = fromIndex === -1 ? null : args[fromIndex + 1];

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "Neither DIRECT_URL nor DATABASE_URL is set. Populate .env before running this.",
  );
  process.exit(1);
}
if (!process.env.DIRECT_URL) {
  // Not fatal, but worth saying out loud — the pooler will reject some DDL.
  console.warn("⚠  DIRECT_URL is not set; falling back to DATABASE_URL (pooled).");
  console.warn("   Schema changes may fail. Set DIRECT_URL to the 5432 connection.\n");
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .filter((name) => (from ? name >= from : true));

if (files.length === 0) {
  console.log("No migration files matched.");
  process.exit(0);
}

console.log(`${dryRun ? "Would apply" : "Applying"} ${files.length} migration(s):\n`);

for (const name of files) {
  const path = join(MIGRATIONS_DIR, name);
  const lineCount = readFileSync(path, "utf8").split("\n").length;

  if (dryRun) {
    console.log(`  · ${name}  (${lineCount} lines)`);
    continue;
  }

  process.stdout.write(`  · ${name} … `);

  // Shelling out to Prisma rather than adding a Postgres client: `pg` is only
  // a transitive dependency of @prisma/adapter-pg, and CLAUDE.md requires
  // approval before anything joins the dependency set. `prisma db execute`
  // is already installed and does exactly this job.
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "db", "execute", "--url", url, "--file", path],
    { encoding: "utf8" },
  );

  if (result.status === 0) {
    console.log("ok");
    continue;
  }

  console.log("FAILED");
  // Printed verbatim so a constraint violation names itself. The URL is not
  // in this output — Prisma reports the error, not the invocation.
  console.error(`\n${result.stderr || result.stdout}`);
  console.error(
    `Stopped at ${name}. Earlier migrations were applied; later ones were not.\n` +
      "Fix the cause and re-run with --from " +
      name,
  );
  process.exit(1);
}

if (!dryRun) {
  console.log("\nAll migrations applied.");
}
