import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatMoney, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { requireProfile } from "@/server/auth";
import { AutoToggle, MoneyMove } from "./controls";

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  const t = await getTranslations("savings");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: goals } = await supabase.rpc("my_goals");
  const goal = goals?.find((g) => g.id === id);
  if (!goal) notFound();

  // RLS: the owner sees their goal's ledger account and its entries.
  const { data: account } = await supabase.from("ledger_accounts").select("id").eq("owner_type", "savings_goal").eq("owner_id", id).maybeSingle();
  const { data: entries } = account
    ? await supabase.from("ledger_entries").select("id, side, amount, created_at").eq("account_id", account.id).order("id", { ascending: false }).limit(30)
    : { data: [] };

  const today = new Date().toISOString().slice(0, 10);
  const locked = Boolean(goal.lock_until && goal.lock_until > today);
  const pct = Math.min(100, Math.round((goal.balance / goal.target_amount) * 100));
  const day = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/epargne" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {t("title")}
      </Link>
      <Card className="gap-2">
        <h1 className="text-2xl font-bold">{goal.name}</h1>
        <p className="text-3xl font-extrabold tabular-nums">{formatMoney(goal.balance, "XOF", locale)}</p>
        <p className="text-muted-foreground tabular-nums">{t("ofTarget", { target: formatMoney(goal.target_amount, "XOF", locale), pct })}</p>
        <div className="h-3 rounded-full bg-muted" aria-hidden>
          <div className="h-3 rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        {pct >= 100 && <p className="font-semibold text-success">{t("reached")}</p>}
        {goal.lock_until && (
          <p className={cn("flex items-center gap-2 text-sm", locked ? "font-medium" : "text-muted-foreground")}>
            <Lock aria-hidden className="size-4" />
            {locked ? t("lockedUntil", { date: day.format(new Date(`${goal.lock_until}T00:00:00`)) }) : t("unlocked")}
          </p>
        )}
      </Card>

      <MoneyMove goalId={goal.id} locked={locked} balance={goal.balance} />
      {goal.weekly_topup_amount && <AutoToggle goalId={goal.id} on={goal.auto_topup} amount={formatMoney(goal.weekly_topup_amount, "XOF", locale)} />}

      <section aria-labelledby="goal-history" className="flex flex-col gap-3">
        <h2 id="goal-history" className="text-lg font-semibold">
          {t("history")}
        </h2>
        {entries?.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {entries.map((e) => (
              <li key={e.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
                <span className="text-sm text-muted-foreground">{when.format(new Date(e.created_at))}</span>
                <span className={cn("font-semibold tabular-nums", e.side === "credit" && "text-success")}>
                  {e.side === "credit" ? "+" : "−"}
                  {formatMoney(e.amount, "XOF", locale)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{t("historyEmpty")}</p>
        )}
      </section>
    </div>
  );
}
