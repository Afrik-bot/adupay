import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, BadgeCheck, Download, FileText } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, type Currency, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { requireProfile } from "@/server/auth";
import { PenaltyButtons, ReminderButtons } from "./controls";

export default async function GestionPage() {
  await requireProfile();
  const t = await getTranslations("manager");
  const tt = await getTranslations("tontines");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: groups } = await supabase.rpc("manager_groups");
  const dateFormat = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { day: "numeric", month: "long" });

  const unpaidByGroup = new Map(
    await Promise.all(
      (groups ?? [])
        .filter((g) => g.status === "active")
        .map(async (g) => [g.group_id, (await supabase.rpc("group_unpaid_members", { p_group_id: g.group_id })).data ?? []] as const),
    ),
  );
  const totalCommission = (groups ?? []).reduce((sum, g) => sum + (g.currency === "XOF" ? g.commission_earned : 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/tontines" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {tt("title")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("lead")}</p>
      </div>

      <Card className="bg-brand-indigo text-brand-offwhite">
        <p className="text-sm font-medium text-brand-offwhite/75">{t("commissionTotal")}</p>
        <p className="text-3xl font-extrabold tabular-nums">{formatMoney(totalCommission, "XOF", locale)}</p>
        <p className="text-sm text-brand-offwhite/75">{t("commissionHint")}</p>
      </Card>

      {!groups?.length && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>}

      {groups?.map((g) => {
        const money = (v: number) => formatMoney(v, g.currency as Currency, locale);
        const unpaid = unpaidByGroup.get(g.group_id) ?? [];
        return (
          <Card key={g.group_id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="truncate">
                  <Link href={`/tontines/${g.group_id}`} className="hover:underline">
                    {g.name}
                  </Link>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {money(g.contribution_amount)} · {tt(`status.${g.status}`)}
                </p>
              </div>
              {g.certified && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                  <BadgeCheck aria-hidden className="size-4" />
                  {t("certified")}
                </span>
              )}
            </div>

            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted p-2">
                <dt className="text-xs text-muted-foreground">{t("collectionRate")}</dt>
                <dd className="text-lg font-bold tabular-nums">{g.collection_rate === null ? "–" : `${g.collection_rate}${locale === "fr" ? " %" : "%"}`}</dd>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <dt className="text-xs text-muted-foreground">{t("rounds")}</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {g.cycles_done}/{g.rotation}
                </dd>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <dt className="text-xs text-muted-foreground">{t("commission")}</dt>
                <dd className="text-lg font-bold tabular-nums">{money(g.commission_earned)}</dd>
              </div>
            </dl>

            {g.status === "active" && g.current_cycle && (
              <p className="text-sm">
                {t("currentRound", {
                  number: g.current_cycle,
                  paid: g.paid_current,
                  total: g.rotation,
                  date: g.current_due ? dateFormat.format(new Date(`${g.current_due}T00:00:00`)) : "",
                })}
              </p>
            )}

            {unpaid.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">{t("unpaidTitle", { count: unpaid.length })}</h3>
                <ul className="divide-y rounded-lg border">
                  {unpaid.map((m) => (
                    <li key={m.member_id} className="flex flex-col gap-2 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{m.full_name}</span>
                        <span className={cn("text-sm", m.days_late > 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                          {m.days_late > 0 ? t("daysLate", { days: m.days_late }) : t("notYetDue")}
                        </span>
                      </div>
                      {m.last_reminder_at && (
                        <span className="text-xs text-muted-foreground">
                          {t("lastReminder", { date: dateFormat.format(new Date(m.last_reminder_at)) })}
                        </span>
                      )}
                      {m.penalty_id && m.penalty_status === "proposed" && (
                        <PenaltyButtons penaltyId={m.penalty_id} label={t("penaltyProposed", { amount: money(m.penalty_amount ?? 0) })} />
                      )}
                      {m.penalty_status === "confirmed" && (
                        <span className="text-sm text-warning">{t("penaltyConfirmed", { amount: money(m.penalty_amount ?? 0) })}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <ReminderButtons groupId={g.group_id} />
              </div>
            )}

            {g.cycles_done > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`/api/tontines/${g.group_id}/releve?format=csv`}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-lg border font-semibold hover:bg-muted"
                >
                  <Download aria-hidden className="size-5" />
                  {t("exportCsv")}
                </a>
                <a
                  href={`/api/tontines/${g.group_id}/releve?format=pdf`}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-lg border font-semibold hover:bg-muted"
                >
                  <FileText aria-hidden className="size-5" />
                  {t("exportPdf")}
                </a>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
