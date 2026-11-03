import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, type Currency, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { requireProfile } from "@/server/auth";
import { ScheduleButtons } from "./schedule-buttons";

const STATUS_STYLES: Record<string, string> = {
  initiated: "bg-warning/15 text-warning",
  paid: "bg-warning/15 text-warning",
  received: "bg-success/15 text-success",
  confirmed: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

export default async function PayerPourPage() {
  const profile = await requireProfile();
  const t = await getTranslations("payFor");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();

  const [{ data: payments }, { data: schedules }, { data: sponsorships }, { data: payees }, { data: groups }] = await Promise.all([
    supabase
      .from("directed_payments")
      .select("id, purpose, payee_id, group_id, beneficiary_name, amount, status, created_at")
      .eq("sender_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("directed_payment_schedules")
      .select("id, purpose, payee_id, group_id, beneficiary_name, amount, source_currency, frequency, next_run_on, status, card_last4")
      .eq("sender_id", profile.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false }),
    supabase.rpc("my_sponsorships"),
    supabase.from("payees").select("id, name"),
    supabase.from("groups").select("id, name"),
  ]);
  const names = new Map([...(payees ?? []), ...(groups ?? [])].map((r) => [r.id, r.name]));
  const day = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button asChild size="sm">
          <Link href="/payer-pour/nouveau">
            <Plus aria-hidden />
            {t("newShort")}
          </Link>
        </Button>
      </div>
      <p className="text-muted-foreground">{t("lead")}</p>

      {sponsorships && sponsorships.filter((s) => s.group_status === "active" && !s.paid).length > 0 && (
        <Card>
          <CardTitle>{t("sponsorDue")}</CardTitle>
          {sponsorships
            .filter((s) => s.group_status === "active" && !s.paid)
            .map((s) => (
              <Link
                key={s.group_id}
                href={`/payer-pour/nouveau?tontine=${s.group_id}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-lg border px-4 hover:bg-muted"
              >
                <span>
                  <span className="block font-semibold">{s.group_name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {t("shareOf", { name: s.member_name, amount: formatMoney(s.contribution_amount, "XOF", locale) })}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5" />
              </Link>
            ))}
        </Card>
      )}

      {schedules && schedules.length > 0 && (
        <section aria-labelledby="schedules-title" className="flex flex-col gap-3">
          <h2 id="schedules-title" className="text-lg font-semibold">
            {t("schedules")}
          </h2>
          {schedules.map((s) => (
            <Card key={s.id} className="gap-3 p-4">
              <div className="flex items-start gap-3">
                <Repeat aria-hidden className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{names.get((s.payee_id ?? s.group_id)!) ?? t(`purposes.${s.purpose}`)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatMoney(s.amount, "XOF", locale)} · {t(`frequency.${s.frequency}` as "frequency.monthly")} · {s.source_currency}
                    {s.card_last4 ? ` · •••• ${s.card_last4}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {s.status === "paused" ? t("schedulePaused") : t("nextRun", { date: day.format(new Date(`${s.next_run_on}T00:00:00`)) })}
                  </p>
                </div>
              </div>
              <ScheduleButtons scheduleId={s.id} status={s.status as "active" | "paused"} />
            </Card>
          ))}
        </section>
      )}

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="text-lg font-semibold">
          {t("history")}
        </h2>
        {payments?.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {payments.map((p) => (
              <li key={p.id}>
                <Link href={`/payer-pour/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{names.get((p.payee_id ?? p.group_id)!) ?? t(`purposes.${p.purpose}`)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {t("forBeneficiary", { name: p.beneficiary_name })} · {day.format(new Date(p.created_at))}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatMoney(p.amount, "XOF" as Currency, locale)}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLES[p.status])}>{t(`status.${p.status}`)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>
        )}
      </section>
    </div>
  );
}
