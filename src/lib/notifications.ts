// Turns a stored notification (template + payload) into the text a member reads,
// in their language. Used by the dispatcher (WhatsApp/SMS) and the notifications centre,
// so both show exactly the same words.
import { formatMoney, isCurrency, type Locale } from "./money";

export const TEMPLATES = [
  "contribution_due",
  "contribution_late",
  "contribution_received",
  "manual_reminder",
  "pot_paid_out",
  "payout_needs_account",
  "payer_pour_delivered",
  "payee_confirmed",
] as const;
export type Template = (typeof TEMPLATES)[number];

/** A translator for the `notifications.templates` namespace. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function formatDate(value: unknown, locale: Locale): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00Z`),
  );
}

/** The values every template may use, already formatted for the reader. */
export function notificationValues(payload: Record<string, unknown>, locale: Locale): Record<string, string> {
  const currency = typeof payload.currency === "string" && isCurrency(payload.currency) ? payload.currency : "XOF";
  const amount = typeof payload.amount === "number" && Number.isSafeInteger(payload.amount) ? formatMoney(payload.amount, currency, locale) : "";
  return {
    amount,
    group: str(payload.group_name),
    cycle: str(payload.cycle),
    date: formatDate(payload.due_date ?? payload.grace_until, locale),
    payee: str(payload.payee_name),
    beneficiary: str(payload.beneficiary_name),
  };
}

export function isTemplate(value: string): value is Template {
  return TEMPLATES.includes(value as Template);
}

export function renderNotification(t: Translate, template: string, payload: unknown, locale: Locale): string {
  const values = notificationValues(payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}, locale);
  return isTemplate(template) ? t(template, values) : t("fallback");
}
