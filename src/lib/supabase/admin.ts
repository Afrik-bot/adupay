import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseDb, type Db } from "@/server/db";
import { serverEnv } from "@/server/env";
import type { Database } from "@/types/database";

/**
 * Service-role client: bypasses RLS and may call money functions.
 * The "server-only" import makes any client-side import a build error.
 */
export function createAdminClient() {
  return createClient<Database>(serverEnv.supabaseUrl(), serverEnv.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminDb(): Db {
  return supabaseDb(createAdminClient());
}
