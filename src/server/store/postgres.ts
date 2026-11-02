// PostgreSQL repository (issue #30): the same TypeORM EntitySchema entities
// and Store implementation as the SQLite adapter, so the shared domain runs
// unchanged. PostgreSQL starts from the current schema (SQLite versions 1-3
// combined) as its own version 1; later changes append versions, never
// rewrite. Startup and every transaction take advisory locks so concurrent
// processes migrate once and transactions stay serialized.

import { DataSource } from "typeorm";
import { primaryKeys, StoreError, uniqueColumns, type Table } from "./types";
import { entities, tables, TypeormStore, type ColumnKind } from "./sqlite";

const POSTGRES_TYPE: Record<ColumnKind, string> = {
  text: "TEXT",
  integer: "INTEGER",
  boolean: "BOOLEAN",
  real: "REAL",
};

const MIGRATION_V1 = [
  ...Object.entries(tables).map(([name, columns]) => {
    const pk = primaryKeys[name as Table];
    const parts = Object.entries(columns).map(([column, kind]) => {
      const pkMark = pk.length === 1 && pk.includes(column) ? " PRIMARY KEY" : "";
      const unlockProof = name === "guest_grants" && column === "explicit_unlock";
      return `"${column}" ${POSTGRES_TYPE[kind]}${pkMark}${unlockProof ? " NOT NULL DEFAULT FALSE" : ""}`;
    });
    if (pk.length > 1)
      parts.push(`PRIMARY KEY (${pk.map((c) => `"${c}"`).join(", ")})`);
    for (const column of uniqueColumns[name as Table] ?? [])
      parts.push(`UNIQUE("${column}")`);
    return `CREATE TABLE IF NOT EXISTS "${name}" (${parts.join(", ")})`;
  }),
];

export type PostgresOptions = {
  url?: string;
  /** Isolated schema (tests); created when missing. */
  schema?: string;
};

export async function openPostgresStore(
  options: PostgresOptions = {},
): Promise<TypeormStore> {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url)
    throw new StoreError("DATABASE_URL is required for the postgres adapter.", "missing");
  if (options.schema && !/^[a-z_][a-z0-9_]*$/.test(options.schema))
    throw new StoreError("Invalid PostgreSQL schema name.", "missing");
  const source = new DataSource({
    type: "postgres",
    url,
    entities: entities(),
    synchronize: false,
    ssl:
      process.env.DATABASE_SSL === "require"
        ? {
            rejectUnauthorized: true,
            ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : {}),
          }
        : false,
    extra: {
      max: Number(process.env.DATABASE_POOL_SIZE || 10),
      ...(options.schema ? { options: `-c search_path=${options.schema}` } : {}),
    },
  });
  await source.initialize();
  if (options.schema)
    await source.query(`CREATE SCHEMA IF NOT EXISTS "${options.schema}"`);
  await source.transaction(async (manager) => {
    await manager.query("SELECT pg_advisory_xact_lock(727273)");
    await manager.query(
      `CREATE TABLE IF NOT EXISTS store_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
    );
    const applied = await manager.query(
      "SELECT version FROM store_migrations WHERE version = 1",
    );
    if (applied.length === 0) {
      for (const statement of MIGRATION_V1) await manager.query(statement);
      await manager.query(
        "INSERT INTO store_migrations(version, applied_at) VALUES (1, $1)",
        [new Date().toISOString()],
      );
    }
  });
  return new TypeormStore(source);
}
