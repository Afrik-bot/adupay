import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The only way server code reaches money logic: calling Postgres functions.
 * Mirrors supabase-js rpc() semantics (scalar -> value, row -> object,
 * set -> array) so tests can run the same code against PGlite.
 */
export interface Db {
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

export class RpcError extends Error {
  constructor(
    readonly fn: string,
    message: string,
    readonly code?: string,
  ) {
    super(`${fn}: ${message}`);
    this.name = "RpcError";
  }
}

export function supabaseDb(client: SupabaseClient): Db {
  return {
    async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw new RpcError(fn, error.message, error.code);
      return data as T;
    },
  };
}
