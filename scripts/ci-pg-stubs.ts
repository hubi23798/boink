/**
 * Apply Supabase-compatible stubs to plain Postgres (CI).
 * Usage: DATABASE_URL=... pnpm exec tsx scripts/ci-pg-stubs.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const sqlFile = resolve(process.cwd(), "scripts/ci-pg-stubs.sql");
const body = readFileSync(sqlFile, "utf8");

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await sql.unsafe(body);
  console.log("ci-pg-stubs applied");
} finally {
  await sql.end({ timeout: 5 });
}
