// Money is always an integer number of minor units (XOF has none; EUR/USD/CAD use cents).
// Formatting is done by hand rather than Intl so output is identical on every
// device and ICU version (low-end Android WebViews differ).

export const CURRENCIES = {
  XOF: { minorDigits: 0 },
  EUR: { minorDigits: 2 },
  USD: { minorDigits: 2 },
  CAD: { minorDigits: 2 },
} as const;

export type Currency = keyof typeof CURRENCIES;
export type Locale = "fr" | "en";

/** Non-breaking space: keeps "150 000 FCFA" on one line on narrow screens. */
export const NBSP = " ";

const SYMBOLS: Record<Locale, Record<Currency, { text: string; before: boolean }>> = {
  fr: {
    XOF: { text: "FCFA", before: false },
    EUR: { text: "€", before: false },
    USD: { text: `$${NBSP}US`, before: false },
    CAD: { text: `$${NBSP}CA`, before: false },
  },
  en: {
    XOF: { text: "FCFA", before: false },
    EUR: { text: "€", before: true },
    USD: { text: "US$", before: true },
    CAD: { text: "CA$", before: true },
  },
};

export function isCurrency(value: string): value is Currency {
  return Object.hasOwn(CURRENCIES, value);
}

function assertMinor(amount: number | bigint): bigint {
  if (typeof amount === "number" && !Number.isSafeInteger(amount)) {
    throw new RangeError(`Money amounts must be safe integers in minor units, got ${amount}`);
  }
  return BigInt(amount);
}

function groupDigits(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * formatMoney(150000, "XOF") -> "150 000 FCFA"
 * formatMoney(123456, "EUR", "en") -> "€1,234.56"
 */
export function formatMoney(amount: number | bigint, currency: Currency, locale: Locale = "fr"): string {
  const minor = assertMinor(amount);
  const { minorDigits } = CURRENCIES[currency];
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const factor = 10n ** BigInt(minorDigits);

  const whole = groupDigits((abs / factor).toString(), locale === "fr" ? NBSP : ",");
  const fraction = minorDigits > 0 ? (abs % factor).toString().padStart(minorDigits, "0") : "";
  const number = fraction ? `${whole}${locale === "fr" ? "," : "."}${fraction}` : whole;

  const symbol = SYMBOLS[locale][currency];
  const body = symbol.before ? `${symbol.text}${number}` : `${number}${NBSP}${symbol.text}`;
  return negative ? `-${body}` : body;
}

/**
 * Parses user input into minor units. Accepts spaces or commas as thousands
 * separators and "," or "." as the decimal mark. Returns null for anything
 * ambiguous or with more decimals than the currency allows.
 */
export function parseMoney(input: string, currency: Currency): number | null {
  const { minorDigits } = CURRENCIES[currency];
  const cleaned = input.trim().replace(/[\s  ]/g, "");
  // Whole part: plain digits or 3-digit groups with one consistent separator.
  // Fraction: 1..minorDigits digits. A 3-digit tail ("1,234") is therefore always
  // a thousands group.
  const fraction = minorDigits > 0 ? `(?:([.,])(\\d{1,${minorDigits}}))?` : "";
  const match = new RegExp(`^(\\d+|\\d{1,3}([.,])\\d{3}(?:\\2\\d{3})*)${fraction}$`).exec(cleaned);
  if (!match) return null;
  const [, whole, groupMark, decimalMark, decimals = ""] = match;
  // "12.345.6": the same mark for thousands and decimals is ambiguous.
  if (groupMark && decimalMark && groupMark === decimalMark) return null;

  const digits = whole.replace(/[.,]/g, "") + decimals.padEnd(minorDigits, "0");
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Basis-point fee on an amount, rounded half up to the nearest minor unit.
 * feeBps 190 = 1.9 %.
 */
export function applyBps(amount: number, bps: number): number {
  assertMinor(amount);
  if (!Number.isInteger(bps) || bps < 0) throw new RangeError("bps must be a non-negative integer");
  return Number((BigInt(amount) * BigInt(bps) * 2n + 10_000n) / 20_000n);
}
