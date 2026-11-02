// Dual-adapter harness (Refs #9/#10): the same behavioral suites run against
// the genuine memory repository and the TypeORM/better-sqlite3 file store.
// TEST_ADAPTER=sqlite selects the file adapter (a fresh temp database per run);
// TEST_ADAPTER=postgres runs them on PostgreSQL (TEST_DATABASE_URL, #30).
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Store } from "../src/server/store/types";

export async function makeStore(): Promise<Store> {
  if (process.env.TEST_ADAPTER === "postgres") {
    // Each store gets its own throwaway schema in TEST_DATABASE_URL (#30).
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL is required for TEST_ADAPTER=postgres.");
    const { openPostgresStore } = await import("../src/server/store/postgres");
    const schema = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return openPostgresStore({ url, schema });
  }
  if (process.env.TEST_ADAPTER === "sqlite") {
    const { openSqliteStore } = await import("../src/server/store/sqlite");
    const dir = await mkdtemp(path.join(tmpdir(), "maxball-sqlite-test-"));
    return openSqliteStore(path.join(dir, "test.sqlite"));
  }
  const { MemoryStore } = await import("../src/server/store/memory");
  return new MemoryStore();
}
export const adapterName = () => process.env.TEST_ADAPTER || "memory";
