import { createTranslator } from "next-intl";
import { renderNotification } from "@/lib/notifications";
import type { Locale } from "@/lib/money";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import type { Db } from "../db";
import type { DeliveryChannel, NotificationProvider } from "./types";

interface Claimed {
  id: string;
  user_id: string;
  channel: string;
  template: string;
  payload: unknown;
  attempts: number;
  phone: string | null;
  locale: string;
}

const translators = {
  fr: createTranslator({ locale: "fr", messages: fr, namespace: "notifications.templates" }),
  en: createTranslator({ locale: "en", messages: en, namespace: "notifications.templates" }),
};

/** The message text in the reader's language (same words as the notifications centre). */
export function messageText(template: string, payload: unknown, locale: Locale): string {
  const t = translators[locale];
  return renderNotification((key, values) => t(key as never, values as never), template, payload, locale);
}

/**
 * Sends queued WhatsApp/SMS messages through the provider. Safe to run from several
 * places at once (cron, webhook, server actions): each message is claimed by one run.
 */
export async function dispatchNotifications(db: Db, provider: NotificationProvider, limit = 50) {
  const claimed = await db.rpc<Claimed[]>("claim_notifications", { p_limit: limit });
  let sent = 0;
  let failed = 0;
  for (const n of claimed ?? []) {
    const locale: Locale = n.locale === "en" ? "en" : "fr";
    try {
      if (!n.phone) throw new Error("no_phone");
      const { providerRef } = await provider.send({
        id: n.id,
        to: n.phone.replace(/^\+/, ""),
        channel: n.channel as DeliveryChannel,
        template: n.template,
        locale,
        text: messageText(n.template, n.payload, locale),
      });
      await db.rpc("complete_notification", { p_id: n.id, p_ok: true, p_provider_ref: providerRef });
      sent++;
    } catch (error) {
      await db.rpc("complete_notification", { p_id: n.id, p_ok: false, p_error: error instanceof Error ? error.message : String(error) });
      failed++;
    }
  }
  return { sent, failed };
}
