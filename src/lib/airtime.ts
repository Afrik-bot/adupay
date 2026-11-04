// AduPay Connect helpers shared by the browser and the server.
import type { Locale } from "./money";

export const OPERATORS = ["orange", "mtn", "moov"] as const;
export type Operator = (typeof OPERATORS)[number];

/**
 * Côte d'Ivoire 10-digit numbering: 07 Orange, 05 MTN, 01 Moov (mirrors
 * operator_for_msisdn in SQL). Only a suggestion: ported numbers keep their prefix.
 */
export function operatorFor(msisdn: string): Operator | null {
  const digits = msisdn.replace(/\D/g, "");
  if (!/^225\d{10}$/.test(digits)) return null;
  return ({ "07": "orange", "05": "mtn", "01": "moov" } as const)[digits.slice(3, 5) as "07" | "05" | "01"] ?? null;
}

/** "500 Mo", "1,5 Go" (fr) / "500 MB", "1.5 GB" (en). */
export function formatVolume(mb: number, locale: Locale): string {
  const space = " ";
  if (mb < 1000) return `${mb}${space}${locale === "fr" ? "Mo" : "MB"}`;
  const gb = (mb / 1000).toString().replace(".", locale === "fr" ? "," : ".");
  return `${gb}${space}${locale === "fr" ? "Go" : "GB"}`;
}

/** "+225 07 11 22 33 44". */
export function formatMsisdn(msisdn: string): string {
  const d = msisdn.replace(/\D/g, "");
  if (!/^225\d{10}$/.test(d)) return msisdn;
  return `+225 ${d.slice(3).replace(/(\d{2})(?=\d)/g, "$1 ")}`;
}
