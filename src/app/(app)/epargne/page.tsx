import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, Lock, Plus, Repeat } from "lucide-react";
import { ScoreGauge } from "@/components/score-gauge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/server/auth";
import { getMyScore } from "@/server/score";

export default async function EpargnePage() {
  await requireProfile();
  const t = await getTranslations("savings");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const [{ data: goals }, score] = await Promise.all([supabase.rpc("my_goals"), getMyScore()]);
  const day = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button asChild size="sm">
          <Link href="/epargne/nouveau">
            <Plus aria-hidden />
            {t("newGoal")}
          </Link>
        </Button>
      </div>

      <Link href="/epargne/score" className="block">
        <Card className="flex-row items-center gap-4 hover:bg-muted">
          <ScoreGauge score={score.score} label={t("score.aria", { score: score.score })} className="w-28 shrink-0 text-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("score.title")}</p>
            <p className="text-sm text-muted-foreground">{t(`score.bands.${score.band}`)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("score.private")}</p>
          </div>
          <ChevronRight aria-hidden className="size-5 shrink-0" />
        </Card>
      </Link>

      <section aria-labelledby="goals-title" className="flex flex-col gap-3">
        <h2 id="goals-title" className="text-lg font-semibold">
          {t("goals")}
        </h2>
        {goals?.length ? (
          <ul className="flex flex-col gap-3">
            {goals.map((g) => {
              const pct = Math.min(100, Math.round((g.balance / g.target_amount) * 100));
              const locked = g.lock_until && g.lock_until > today;
              return (
                <li key={g.id}>
                  <Link href={`/epargne/${g.id}`} className="block rounded-xl border bg-card p-4 hover:bg-muted">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-semibold">{g.name}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{pct}%</span>
                    </div>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {formatMoney(g.balance, "XOF", locale)} / {formatMoney(g.target_amount, "XOF", locale)}
                    </p>
                    <div className="mt-2 h-2.5 rounded-full bg-muted" aria-hidden>
                      <div className="h-2.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {locked && (
                        <span className="flex items-center gap-1">
                          <Lock aria-hidden className="size-3.5" />
                          {t("lockedUntil", { date: day.format(new Date(`${g.lock_until}T00:00:00`)) })}
                        </span>
                      )}
                      {g.auto_topup && g.weekly_topup_amount && (
                        <span className="flex items-center gap-1">
                          <Repeat aria-hidden className="size-3.5" />
                          {t("weekly", { amount: formatMoney(g.weekly_topup_amount, "XOF", locale) })}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>
        )}
      </section>
    </div>
  );
}
