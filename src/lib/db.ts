import { mkdirSync } from "node:fs";
import path from "node:path";

import { SCHEMA, SCHEMA_VERSION } from "./schema";

export type Row = Record<string, unknown>;

/** All the rest of Thanos needs from a database: run SQL with $1-style parameters. */
export interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

/**
 * Hosted when DATABASE_URL names a Postgres (Supabase, Neon, the university's own). Otherwise
 * local: PGlite, the same Postgres compiled to WebAssembly, keeping its files in .thanos/ here.
 */
export const isLocal = !process.env.DATABASE_URL;

// Kept on globalThis so a dev server's hot reload reuses the open database instead of opening
// the same files a second time.
const kept = globalThis as unknown as { thanosDb?: Promise<Db> };

export function db(): Promise<Db> {
  if (!kept.thanosDb) {
    const opening = open();
    kept.thanosDb = opening;
    opening.catch(() => {
      if (kept.thanosDb === opening) kept.thanosDb = undefined; // the next request tries again
    });
  }
  return kept.thanosDb;
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    // prepare: false, so it also works through a transaction pooler (Supabase's port 6543).
    const sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} });
    const conn: Db = {
      query: async <T,>(text: string, params: unknown[] = []) =>
        (await sql.unsafe(text, params as never[])) as unknown as T[],
    };
    await migrate(conn, async (text) => void (await sql.unsafe(text)));
    return conn;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.THANOS_DATA_DIR || path.join(process.cwd(), ".thanos", "db");
  mkdirSync(path.dirname(dir), { recursive: true, mode: 0o700 });
  const pg = await PGlite.create(dir);
  const conn: Db = {
    query: async <T,>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  };
  await migrate(conn, async (text) => void (await pg.exec(text)));
  return conn;
}

async function migrate(conn: Db, exec: (sql: string) => Promise<void>) {
  await exec("create table if not exists thanos_meta (key text primary key, value text not null)");
  const [row] = await conn.query<{ value: string }>("select value from thanos_meta where key = 'schema'");
  if (Number(row?.value ?? 0) >= SCHEMA_VERSION) return;
  await exec(SCHEMA);
  await conn.query(
    "insert into thanos_meta (key, value) values ('schema', $1) on conflict (key) do update set value = excluded.value",
    [String(SCHEMA_VERSION)],
  );
  // A local copy starts with the labs it was made for; a hosted one starts empty and its
  // operators add labs from /new.
  if (isLocal) await (await import("./labs")).seedLocalLabs(conn);
}

/** A timestamp from either driver as an ISO string. */
export function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}
