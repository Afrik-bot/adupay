// Runs the real migrations against PGlite (Postgres compiled to WASM, in-process),
// so schema, RLS and money functions are tested without Docker or a hosted project.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite, types, type Transaction } from "@electric-sql/pglite";
import type { Db } from "@/server/db";

const SUPABASE_DIR = path.resolve(__dirname, "..");

export const DEMO = {
  awa: "11111111-1111-4111-8111-111111111111",
  koffi: "22222222-2222-4222-8222-222222222222",
  aminata: "33333333-3333-4333-8333-333333333333",
  adjameGroup: "aaaaaaaa-0000-4000-8000-000000000001",
  yopougonGroup: "aaaaaaaa-0000-4000-8000-000000000002",
} as const;

export function migrationSql(): string[] {
  const dir = path.join(SUPABASE_DIR, "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8"));
}

export function shimSql(): string {
  return readFileSync(path.join(SUPABASE_DIR, "tests", "supabase-shim.sql"), "utf8");
}

export function seedSql(): string {
  return readFileSync(path.join(SUPABASE_DIR, "seed.sql"), "utf8");
}

type Queryable = Pick<Transaction, "query" | "exec">;
type Who = { role: "anon" } | { role: "authenticated"; userId: string } | { role: "service_role" };

/**
 * Builds the call for a function the way supabase-js rpc() returns it:
 * set-returning -> array, composite -> object (or null), scalar -> value.
 */
async function callFunction<T>(q: Queryable, fn: string, args: Record<string, unknown>): Promise<T> {
  const meta = await q.query<{ retset: boolean; typtype: string }>(
    `select p.proretset as retset, t.typtype
       from pg_proc p join pg_type t on t.oid = p.prorettype
      where p.proname = $1 and p.pronamespace = 'public'::regnamespace`,
    [fn],
  );
  if (meta.rows.length !== 1) throw new Error(`function public.${fn} not found (or overloaded)`);
  const { retset, typtype } = meta.rows[0];

  const names = Object.keys(args);
  const params = names.map((name) => {
    const value = args[name];
    return value !== null && typeof value === "object" && !(value instanceof Date) ? JSON.stringify(value) : value;
  });
  const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")})`;

  if (retset) return (await q.query(`select * from ${call}`, params)).rows as T;
  if (typtype === "c") {
    const row = (await q.query<Record<string, unknown>>(`select * from ${call}`, params)).rows[0];
    return (row && Object.values(row).some((v) => v !== null) ? row : null) as T;
  }
  return (await q.query<{ v: T }>(`select ${call} as v`, params)).rows[0].v;
}

export class TestDb {
  constructor(readonly pg: PGlite) {}

  static async create({ seed = true } = {}): Promise<TestDb> {
    const pg = await PGlite.create({ parsers: { [types.INT8]: (value: string) => Number(value) } });
    await pg.exec(shimSql());
    for (const sql of migrationSql()) await pg.exec(sql);
    if (seed) await pg.exec(seedSql());
    return new TestDb(pg);
  }

  /** Runs fn in a transaction as the given Supabase role, with auth.uid() set. */
  as<T>(who: Who, fn: (q: Queryable) => Promise<T>): Promise<T> {
    return this.pg.transaction(async (tx) => {
      const claims = who.role === "authenticated" ? { sub: who.userId, role: who.role } : { role: who.role };
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.exec(`set local role ${who.role}`);
      return fn(tx);
    });
  }

  asUser<T>(userId: string, fn: (q: Queryable) => Promise<T>) {
    return this.as({ role: "authenticated", userId }, fn);
  }

  /** The server-side Db, calling functions as service_role like the real app does. */
  serviceDb(): Db {
    return { rpc: (fn, args = {}) => this.as({ role: "service_role" }, (q) => callFunction(q, fn, args)) };
  }

  /** A Db that calls functions as a signed-in user, to prove they are refused. */
  userDb(userId: string): Db {
    return { rpc: (fn, args = {}) => this.asUser(userId, (q) => callFunction(q, fn, args)) };
  }

  async one<T>(sql: string, params: unknown[] = []): Promise<T> {
    return (await this.pg.query<T>(sql, params)).rows[0];
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(sql, params)).rows;
  }

  close() {
    return this.pg.close();
  }
}
