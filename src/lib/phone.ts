// Phone numbers for sign-in. Côte d'Ivoire numbers keep their leading 0 (10 digits
// since 2021); France drops its trunk 0. Output is E.164 ("+2250700000001"),
// which is what Supabase Auth expects.

export interface PhoneCountry {
  iso: string;
  dial: string;
  /** National significant number pattern, after any trunk prefix is removed. */
  pattern: RegExp;
  /** Trunk prefix dropped when dialling internationally ("0" in France). */
  trunk?: string;
  /** Digit groups for display, e.g. [2,2,2,2,2]. */
  groups: number[];
  example: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "CI", dial: "225", pattern: /^0[1-9]\d{8}$|^2[1-7]\d{8}$/, groups: [2, 2, 2, 2, 2], example: "07 00 00 00 01" },
  { iso: "SN", dial: "221", pattern: /^[37]\d{8}$/, groups: [2, 3, 2, 2], example: "77 000 00 01" },
  { iso: "ML", dial: "223", pattern: /^[2-9]\d{7}$/, groups: [2, 2, 2, 2], example: "70 00 00 01" },
  { iso: "BF", dial: "226", pattern: /^[2-7]\d{7}$/, groups: [2, 2, 2, 2], example: "70 00 00 01" },
  { iso: "NE", dial: "227", pattern: /^[2-9]\d{7}$/, groups: [2, 2, 2, 2], example: "90 00 00 01" },
  { iso: "TG", dial: "228", pattern: /^[2-9]\d{7}$/, groups: [2, 2, 2, 2], example: "90 00 00 01" },
  { iso: "BJ", dial: "229", pattern: /^01\d{8}$/, groups: [2, 2, 2, 2, 2], example: "01 90 00 00 01" },
  { iso: "GW", dial: "245", pattern: /^9\d{8}$/, groups: [3, 3, 3], example: "955 000 001" },
  { iso: "FR", dial: "33", trunk: "0", pattern: /^[1-9]\d{8}$/, groups: [1, 2, 2, 2, 2], example: "6 12 34 56 78" },
  { iso: "US", dial: "1", pattern: /^[2-9]\d{2}[2-9]\d{6}$/, groups: [3, 3, 4], example: "713 555 0101" },
  { iso: "CA", dial: "1", pattern: /^[2-9]\d{2}[2-9]\d{6}$/, groups: [3, 3, 4], example: "514 555 0101" },
];

export const DEFAULT_PHONE_COUNTRY = "CI";

export function phoneCountry(iso: string): PhoneCountry {
  const found = PHONE_COUNTRIES.find((c) => c.iso === iso);
  if (!found) throw new Error(`Unsupported phone country ${iso}`);
  return found;
}

/**
 * Turns what the user typed into E.164, or null if it is not a valid number for
 * the chosen country. A number typed with its own "+" or "00" prefix is read as
 * international and must belong to one of the supported countries.
 */
export function toE164(input: string, countryIso: string): string | null {
  const raw = input.trim().replace(/[\s.\-() ]/g, "");
  if (!/^(\+|00)?\d+$/.test(raw)) return null;

  if (raw.startsWith("+") || raw.startsWith("00")) {
    const digits = raw.replace(/^(\+|00)/, "");
    // Prefer the selected country when dial codes are shared (+1 US/CA).
    const candidates = [phoneCountry(countryIso), ...PHONE_COUNTRIES].filter((c) => digits.startsWith(c.dial));
    for (const country of candidates) {
      const national = digits.slice(country.dial.length);
      if (country.pattern.test(national)) return `+${country.dial}${national}`;
    }
    return null;
  }

  const country = phoneCountry(countryIso);
  let national = raw;
  if (country.trunk && national.startsWith(country.trunk) && !country.pattern.test(national)) {
    national = national.slice(country.trunk.length);
  }
  return country.pattern.test(national) ? `+${country.dial}${national}` : null;
}

/** "+2250700000001" -> "+225 07 00 00 00 01" (for display only). */
export function formatE164(e164: string): string {
  const digits = e164.replace(/^\+/, "");
  const country = [...PHONE_COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial) && c.pattern.test(digits.slice(c.dial.length)));
  if (!country) return e164;
  let rest = digits.slice(country.dial.length);
  const parts: string[] = [];
  for (const size of country.groups) {
    parts.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  if (rest) parts.push(rest);
  return `+${country.dial} ${parts.filter(Boolean).join(" ")}`;
}
