// Sandbox card handling. Like a real card provider's hosted fields, the number
// is checked and swapped for a token in the browser: AduPay's server only ever
// receives the token, the brand and the last 4 digits. CVC is never stored.

export type CardBrand = "visa" | "mastercard" | "amex" | "other";

export interface CardInput {
  number: string;
  expiry: string; // "MM/AA"
  cvc: string;
}

export type CardError = "number" | "expiry" | "cvc";

export interface CardToken {
  token: string;
  brand: CardBrand;
  last4: string;
}

/** Test cards for the sandbox (same suffix rule as wallets: …9992 is declined). */
export const SANDBOX_TEST_CARDS = {
  success: "4242 4242 4242 4242",
  declined: "4000 0000 0003 9992",
} as const;

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function luhnValid(number: string): boolean {
  const digits = digitsOnly(number);
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardBrand(number: string): CardBrand {
  const d = digitsOnly(number);
  if (/^4/.test(d)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "mastercard";
  if (/^3[47]/.test(d)) return "amex";
  return "other";
}

/** "4242424242424242" -> "4242 4242 4242 4242" (Amex: 4-6-5). */
export function formatCardNumber(value: string): string {
  const d = digitsOnly(value).slice(0, 19);
  if (cardBrand(d) === "amex") return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(" ");
  return d.replace(/(.{4})/g, "$1 ").trim();
}

export function expiryValid(expiry: string, now = new Date()): boolean {
  const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(expiry.trim());
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  // Valid through the end of the expiry month.
  return new Date(Date.UTC(year, month, 1)) > now;
}

export function validateCard(card: CardInput, now = new Date()): CardError | null {
  if (!luhnValid(card.number)) return "number";
  if (!expiryValid(card.expiry, now)) return "expiry";
  const cvcLength = cardBrand(card.number) === "amex" ? 4 : 3;
  if (!new RegExp(`^\\d{${cvcLength}}$`).test(card.cvc.trim())) return "cvc";
  return null;
}

/** Browser-side tokenization (sandbox). The token ends with the last 4 digits so test outcomes carry over. */
export function tokenizeCard(card: CardInput, randomId: () => string = () => crypto.randomUUID()): CardToken | { error: CardError } {
  const error = validateCard(card);
  if (error) return { error };
  const last4 = digitsOnly(card.number).slice(-4);
  return { token: `sbxcard_${randomId().replace(/-/g, "").slice(0, 12)}_${last4}`, brand: cardBrand(card.number), last4 };
}
