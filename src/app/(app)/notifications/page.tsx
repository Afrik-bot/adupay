import { getLocale, getTranslations } from "next-intl/server";
import { MessageCircle, MessageSquareText, Smartphone } from "lucide-react";
import type { Locale } from "@/lib/money";
import { renderNotification } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { MarkRead } from "./mark-read";

const FILTERS = ["all", "whatsapp", "sms"] as const;
const ICONS = { whatsapp: MessageCircle, sms: MessageSquareText, in_app: Smartphone, ussd: Smartphone };

/** The notifications centre: every message AduPay sent the user, with the exact simulated text. */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ canal?: string }> }) {
  const { canal } = await searchParams;
  const filter = FILTERS.includes(canal as never) ? (canal as (typeof FILTERS)[number]) : "all";
  const t = await getTranslations("notifications");
  const templates = await getTranslations("notifications.templates");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("id, channel, template, payload, read_at, created_at, delivery_status")
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter !== "all") query = query.eq("channel", filter);
  const { data: rows } = await query;
  const unread = (rows ?? []).some((r) => !r.read_at);
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("lead")}</p>
        </div>
        {unread && <MarkRead />}
      </div>
      <p className="rounded-lg bg-accent/40 p-3 text-sm">{t("simulated")}</p>
      <nav aria-label={t("filters.label")} className="flex gap-2">
        {FILTERS.map((f) => (
          <a
            key={f}
            href={f === "all" ? "/notifications" : `/notifications?canal=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={cn("flex min-h-12 items-center rounded-full border px-4 text-sm font-semibold", filter === f && "bg-primary text-primary-foreground")}
          >
            {t(`filters.${f}`)}
          </a>
        ))}
      </nav>
      {!rows?.length && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>}
      <ul className="flex flex-col gap-3">
        {(rows ?? []).map((n) => {
          const Icon = ICONS[n.channel];
          return (
            <li key={n.id} className={cn("flex gap-3 rounded-xl border bg-card p-4", !n.read_at && "border-accent")}>
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full",
                  n.channel === "whatsapp" ? "bg-success/15 text-success" : "bg-muted text-foreground",
                )}
              >
                <Icon aria-hidden className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{t(`channels.${n.channel}`)}</span>
                  <span>{when.format(new Date(n.created_at))}</span>
                  <span>· {t(`delivery.${n.delivery_status as "sent"}`)}</span>
                  {!n.read_at && <span className="rounded-full bg-accent px-2 font-semibold text-accent-foreground">{t("unread")}</span>}
                </p>
                <p className="break-words">{renderNotification((key, values) => templates(key as never, values as never), n.template, n.payload, locale)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
