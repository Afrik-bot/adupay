import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import type { Db } from "./db";

/** Per-user limits for actions that move money or can be brute-forced. */
export const LIMITS = {
  payment: { max: 20, windowSeconds: 10 * 60 }, // shares, Payer pour, savings moves
  join: { max: 20, windowSeconds: 60 * 60 }, // invite codes
  kyc: { max: 10, windowSeconds: 24 * 60 * 60 },
  linkAccount: { max: 10, windowSeconds: 60 * 60 },
  ussd: { max: 60, windowSeconds: 10 * 60 },
} as const;

export type LimitedAction = keyof typeof LIMITS;

/**
 * Counts one attempt and says whether it is allowed. Fails open if the limiter
 * itself errors (availability over strictness; money rules still run in the DB).
 */
export async function allow(action: LimitedAction, userId: string, db: Db = adminDb()): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[action];
  try {
    return await db.rpc<boolean>("hit_rate_limit", { p_key: `${action}:${userId}`, p_max: max, p_window_seconds: windowSeconds });
  } catch (error) {
    console.error("rate limiter unavailable", error);
    return true;
  }
}
