// The *123# menu as a pure function of what the user typed so far, the way USSD
// gateways (e.g. Africa's Talking) send it: "2*1*1" = option 2, then 1, then 1.
// "0" goes back one screen, "00" back to the main menu. The backend is injected,
// so the in-app simulator and a future gateway call the same app functions.
import { formatMoney, type Currency, type Locale } from "./money";

export interface UssdDue {
  groupId: string;
  groupName: string;
  cycleNumber: number;
  amount: number;
  currency: Currency;
  dueDate: string;
  paid: boolean;
}

export type UssdPayError = "notMember" | "notStarted" | "alreadyPaid" | "noAccount" | "relinkAccount" | "kycRequired" | "kycLimit" | "tooMany" | "generic";

export interface UssdBackend {
  balances(): Promise<{ currency: Currency; balance: number }[]>;
  dues(): Promise<UssdDue[]>;
  tontines(): Promise<{ groupId: string; name: string }[]>;
  payShare(groupId: string): Promise<{ ok: true } | { error: UssdPayError }>;
  setLocale(locale: Locale): Promise<void>;
}

export type UssdTranslate = (key: string, values?: Record<string, string | number>) => string;

export interface UssdReply {
  /** false = "CON" (waits for an answer), true = "END" (session closes). */
  end: boolean;
  text: string;
}

/** Most phones show about 160 characters per USSD screen. */
export const USSD_MAX = 182;
const MAX_ITEMS = 5;

/** Applies "0" (back) and "00" (home) to the raw input. */
export function ussdPath(input: string): string[] {
  const path: string[] = [];
  for (const part of input.split("*").map((p) => p.trim())) {
    if (part === "") continue;
    if (part === "00") path.length = 0;
    else if (part === "0") path.pop();
    else path.push(part);
  }
  return path;
}

const short = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fit = (text: string) => (text.length > USSD_MAX ? `${text.slice(0, USSD_MAX - 1)}…` : text);

/** "2026-11-20" → "20/11" (day/month in both languages). */
function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export async function runUssd(
  input: string,
  ctx: { locale: Locale; backend: UssdBackend; translator: (locale: Locale) => UssdTranslate },
): Promise<UssdReply> {
  const { locale, backend } = ctx;
  const t = ctx.translator(locale);
  const con = (text: string): UssdReply => ({ end: false, text: fit(text) });
  const end = (text: string): UssdReply => ({ end: true, text: fit(text) });
  const money = (amount: number, currency: Currency) => formatMoney(amount, currency, locale);
  const [first, second, third, ...rest] = ussdPath(input);

  if (!first) return con(t("main"));

  if (first === "1") {
    if (second) return end(t("invalid"));
    const balances = await backend.balances();
    const xof = balances.find((b) => b.currency === "XOF")?.balance ?? 0;
    const others = balances.filter((b) => b.currency !== "XOF" && b.balance !== 0).map((b) => money(b.balance, b.currency));
    return end([t("balance", { amount: money(xof, "XOF") }), ...others].join("\n"));
  }

  if (first === "2") {
    const unpaid = (await backend.dues()).filter((d) => !d.paid).slice(0, MAX_ITEMS);
    if (!unpaid.length) return end(t("nothingDue"));
    if (!second) {
      const lines = unpaid.map((d, i) => `${i + 1}. ${short(d.groupName, 18)} ${money(d.amount, d.currency)}`);
      return con([t("chooseDue"), ...lines, t("back")].join("\n"));
    }
    const due = unpaid[Number(second) - 1];
    if (!/^\d$/.test(second) || !due) return end(t("invalid"));
    if (!third) {
      return con(t("confirm", { amount: money(due.amount, due.currency), group: short(due.groupName), cycle: due.cycleNumber }));
    }
    if (rest.length) return end(t("invalid"));
    if (third === "2") return end(t("cancelled"));
    if (third !== "1") return end(t("invalid"));
    const result = await backend.payShare(due.groupId);
    if ("ok" in result) return end(t("paid", { amount: money(due.amount, due.currency), group: short(due.groupName) }));
    return end(t(`errors.${result.error}`));
  }

  if (first === "3") {
    if (second) return end(t("invalid"));
    const [groups, dues] = await Promise.all([backend.tontines(), backend.dues()]);
    if (!groups.length) return end(t("noTontines"));
    const byGroup = new Map(dues.map((d) => [d.groupId, d]));
    const lines = groups.slice(0, MAX_ITEMS).map((g) => {
      const d = byGroup.get(g.groupId);
      const name = short(g.name, 20);
      if (!d) return t("tontineIdle", { group: name });
      if (d.paid) return t("tontinePaid", { group: name, cycle: d.cycleNumber });
      return t("tontineDue", { group: name, amount: money(d.amount, d.currency), date: shortDate(d.dueDate) });
    });
    return end([t("tontinesTitle"), ...lines].join("\n"));
  }

  if (first === "4") {
    if (!second) return con(t("language"));
    const next: Locale | null = second === "1" ? "fr" : second === "2" ? "en" : null;
    if (!next || third) return end(t("invalid"));
    await backend.setLocale(next);
    return end(ctx.translator(next)("languageSet"));
  }

  return end(t("invalid"));
}
