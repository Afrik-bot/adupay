import "server-only";
import { createHmac } from "node:crypto";
import { serverEnv } from "./env";

export const ID_DOCUMENT_TYPES = ["cni", "passport", "residence_permit"] as const;
export const KYC_DOCUMENT_TYPES = [...ID_DOCUMENT_TYPES, "selfie", "proof_of_address"] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

/**
 * ID numbers are never stored in plain text. A keyed hash still lets us spot the
 * same document used on two accounts; only the last 4 characters stay readable.
 */
export function protectIdNumber(raw: string): { hash: string; last4: string } | null {
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 5 || normalized.length > 30) return null;
  return {
    hash: createHmac("sha256", serverEnv.kycIdPepper()).update(normalized).digest("hex"),
    last4: normalized.slice(-4),
  };
}
