import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Check, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, type Currency, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  succeeded: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  failed: "bg-destructive/15 text-destructive",
} as const;

export async function BalanceCard() {
  const t = await getTranslations("home");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: balances } = await supabase.rpc("my_balances");
  // Balances come from the ledger only; no account yet means zero.
  const xof = balances?.find((b) => b.currency === "XOF")?.balance ?? 0;
  const others = (balances ?? []).filter((b) => b.currency !== "XOF" && b.balance !== 0);

  return (
    <Card className="bg-brand-indigo text-brand-offwhite">
      <p className="text-sm font-medium text-brand-offwhite/75">{t("balance")}</p>
      <p className="text-4xl font-extrabold tracking-tight tabular-nums">{formatMoney(xof, "XOF", locale)}</p>
      {others.map((b) => (
        <p key={b.currency} className="text-brand-offwhite/80 tabular-nums">
          {formatMoney(b.balance, b.currency as Currency, locale)}
        </p>
      ))}
    </Card>
  );
}

export async function UpcomingDues() {
  const t = await getTranslations("home");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: dues } = await supabase.rpc("my_upcoming_dues");
  const dateFormat = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { day: "numeric", month: "long" });

  return (
    <section aria-labelledby="dues-title" className="flex flex-col gap-3">
      <h2 id="dues-title" className="text-lg font-semibold">
        {t("dues")}
      </h2>
      {!dues?.length ? (
        <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{t("noDues")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dues.map((due) => (
            <li key={`${due.cycle_id}:${due.member_id}`}>
              <Link
                href={`/tontines/${due.group_id}`}
                className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    due.paid ? "bg-success/15 text-success" : "bg-accent text-accent-foreground",
                  )}
                >
                  {due.paid ? <Check className="size-5" /> : <CalendarClock className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{due.group_name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {due.paid
                      ? t("duePaid", { cycle: due.cycle_number })
                      : t("dueOn", { cycle: due.cycle_number, date: dateFormat.format(new Date(`${due.due_date}T00:00:00`)) })}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatMoney(due.amount, due.currency as Currency, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function transactionLabel(purpose: string | null, direction: "collect" | "payout") {
  switch (purpose) {
    case "contribution":
      return "contribution";
    case "wallet_topup":
      return "topup";
    case "directed_payment":
      return "payFor";
    case "tontine_payout":
      return "potReceived";
    case "savings_topup":
      return "savingsIn";
    case "savings_withdrawal":
      return "savingsOut";
    default:
      return direction === "payout" ? "received" : "paid";
  }
}

export async function RecentTransactions() {
  const t = await getTranslations("home");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  // RLS limits this to the caller's own payments.
  const { data: payments } = await supabase
    .from("payments")
    .select("id, direction, amount, currency, status, purpose_type, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  const dateFormat = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Abidjan",
  });

  return (
    <section aria-labelledby="tx-title" className="flex flex-col gap-3">
      <h2 id="tx-title" className="text-lg font-semibold">
        {t("transactions")}
      </h2>
      {!payments?.length ? (
        <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{t("noTransactions")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {payments.map((p) => {
            const incoming = p.direction === "payout";
            const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
            return (
              <li key={p.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t(`tx.${transactionLabel(p.purpose_type, p.direction)}`)}</span>
                  <span className="block text-sm text-muted-foreground">{dateFormat.format(new Date(p.created_at))}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className={cn("font-semibold tabular-nums", incoming && "text-success")}>
                    {incoming ? "+" : "−"}
                    {formatMoney(p.amount, p.currency as Currency, locale)}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLES[p.status])}>
                    {t(`status.${p.status}`)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export async function LinkWalletNudge() {
  const t = await getTranslations("home");
  const supabase = await createClient();
  const { count } = await supabase.from("linked_accounts").select("id", { count: "exact", head: true });
  if (count) return null;
  return (
    <Link
      href="/profil/comptes"
      className="flex min-h-16 items-center gap-3 rounded-xl border-2 border-dashed border-accent bg-card p-4 hover:bg-muted"
    >
      <Wallet aria-hidden className="size-6 shrink-0" />
      <span>
        <span className="block font-semibold">{t("linkWallet")}</span>
        <span className="block text-sm text-muted-foreground">{t("linkWalletHint")}</span>
      </span>
    </Link>
  );
}

export function BalanceSkeleton() {
  return <Skeleton className="h-[7.5rem] rounded-xl" />;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 rounded-xl" />
      ))}
    </div>
  );
}
