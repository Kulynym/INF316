// One-way data migration SQLite -> PostgreSQL (issue #30).
//
//   DATABASE_URL=postgres://... node scripts/migrate-sqlite-to-postgres.mjs <file.sqlite> [--replace]
//
// The PostgreSQL schema is owned by the application (src/server/store/postgres.ts):
// start the app once with MAXBALL_ADAPTER=postgres so it migrates the schema,
// then run this script. Every table is copied inside one transaction; row
// counts are compared before COMMIT, so a failure leaves PostgreSQL untouched.
// Without --replace the script refuses to write into non-empty tables (the app
// seeds demo rows on first start, so --replace is the normal choice).
// Plain JavaScript on purpose: it runs inside the production image.

import Database from "better-sqlite3";
import pg from "pg";

const TABLES = [
  "profiles", "courses", "teachers", "feedback", "feedback_access", "sessions",
  "guest_grants", "local_credentials", "tokens", "official_replies", "comments",
  "supports", "bookmarks", "ratings", "status_history", "notifications",
  "attachments", "jobs", "moderation_flags", "rate_limits", "submissions",
  "reports", "moderation_log",
];

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const replace = args.includes("--replace");
if (!file || !process.env.DATABASE_URL) {
  console.error("Usage: DATABASE_URL=postgres://... node scripts/migrate-sqlite-to-postgres.mjs <file.sqlite> [--replace]");
  process.exit(2);
}

const sqlite = new Database(file, { readonly: true, fileMustExist: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const quote = (name) => `"${name.replaceAll('"', '""')}"`;

try {
  const migrated = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_name = 'store_migrations' AND table_schema = current_schema()",
  );
  if (migrated.rowCount === 0)
    throw new Error("PostgreSQL schema missing: start the app once with MAXBALL_ADAPTER=postgres first.");

  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(727274)");
  const report = [];
  for (const table of TABLES) {
    const exists = sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table);
    const target = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND table_schema = current_schema()",
      [table],
    );
    const pgColumns = new Map(target.rows.map((r) => [r.column_name, r.data_type]));
    const existing = Number((await client.query(`SELECT count(*) AS n FROM ${quote(table)}`)).rows[0].n);
    if (existing > 0 && !replace)
      throw new Error(`${table} already has ${existing} rows; rerun with --replace to overwrite.`);
    if (replace) await client.query(`DELETE FROM ${quote(table)}`);
    if (!exists) {
      report.push([table, 0, 0]);
      continue;
    }
    const sourceColumns = sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all().map((c) => c.name);
    const columns = sourceColumns.filter((c) => pgColumns.has(c));
    const rows = sqlite.prepare(`SELECT ${columns.map(quote).join(", ")} FROM ${quote(table)}`).all();
    for (const row of rows) {
      const values = columns.map((c) => {
        const value = row[c];
        if (pgColumns.get(c) === "boolean" && value !== null) return Boolean(value);
        return value;
      });
      await client.query(
        `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
        values,
      );
    }
    const copied = Number((await client.query(`SELECT count(*) AS n FROM ${quote(table)}`)).rows[0].n);
    if (copied !== rows.length)
      throw new Error(`${table}: expected ${rows.length} rows in PostgreSQL, found ${copied}.`);
    report.push([table, rows.length, copied]);
  }
  await client.query("COMMIT");
  console.table(report.map(([table, source, target]) => ({ table, sqlite: source, postgres: target })));
  console.log("Migration committed.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`Migration failed, nothing was written: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
  sqlite.close();
}
