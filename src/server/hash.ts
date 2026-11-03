import "server-only";
import { createHmac } from "node:crypto";
import { serverEnv } from "./env";

/**
 * Keyed hash for identifiers we must recognise but never store readable
 * (account numbers). The purpose prefix keeps hashes from different uses apart.
 */
export function keyedHash(purpose: string, value: string): string {
  return createHmac("sha256", serverEnv.kycIdPepper()).update(`${purpose}:${value}`).digest("hex");
}
