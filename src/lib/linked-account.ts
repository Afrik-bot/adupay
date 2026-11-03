import { toE164 } from "./phone";

export const WALLET_PROVIDERS = ["orange_money", "mtn_momo", "moov_money", "wave", "bank"] as const;
export type WalletProvider = (typeof WALLET_PROVIDERS)[number];

// Côte d'Ivoire mobile prefixes since the 2021 move to 10 digits.
const CI_NETWORK_PREFIX: Partial<Record<WalletProvider, string[]>> = {
  orange_money: ["07"],
  mtn_momo: ["05"],
  moov_money: ["01"],
  wave: ["01", "05", "07"], // Wave works with any network's number
};

// UEMOA countries; their IBANs are all 28 characters.
const UEMOA_IBAN_COUNTRIES = new Set(["BJ", "BF", "CI", "GW", "ML", "NE", "SN", "TG"]);

export type AccountError = "invalidNumber" | "wrongNetwork" | "invalidIban";

export type ValidatedAccount = {
  /** Canonical value used for the hash (E.164 or IBAN without spaces). */
  canonical: string;
  /** What we store and show: never the full number. */
  masked: string;
};

export function maskAccount(canonical: string): string {
  return `•••• ${canonical.slice(-4)}`;
}

/** ISO 13616 check: move the first 4 characters to the end, letters to numbers, mod 97 must be 1. */
export function ibanChecksumOk(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function validateAccount(provider: WalletProvider, input: string): ValidatedAccount | { error: AccountError } {
  if (provider === "bank") {
    const iban = input.toUpperCase().replace(/[\s-]/g, "");
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{24}$/.test(iban) || !UEMOA_IBAN_COUNTRIES.has(iban.slice(0, 2)) || !ibanChecksumOk(iban)) {
      return { error: "invalidIban" };
    }
    return { canonical: iban, masked: maskAccount(iban) };
  }

  const e164 = toE164(input, "CI");
  if (!e164 || !e164.startsWith("+225")) return { error: "invalidNumber" };
  const prefix = e164.slice(4, 6);
  if (!CI_NETWORK_PREFIX[provider]!.includes(prefix)) {
    return { error: ["01", "05", "07"].includes(prefix) ? "wrongNetwork" : "invalidNumber" };
  }
  return { canonical: e164, masked: maskAccount(e164) };
}

/** "CI93CI0080111301134291200589" -> "CI93 CI00 8011 1301 1342 9120 0589" */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
