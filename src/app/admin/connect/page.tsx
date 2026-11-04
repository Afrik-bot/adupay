import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { inputClass } from "@/components/ui/field";
import { formatMsisdn, formatVolume } from "@/lib/airtime";
import { formatMoney, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { BudgetForm, ProductRow, RuleForm } from "./forms";

const STATUSES = ["awaiting_payment", "queued", "sending", "pending", "succeeded", "failed"] as const;
const SOURCES = ["wallet", "card", "reward"] as const;
const OPERATORS = ["orange", "mtn", "moov"] as const;
const TRIGGERS = ["on_time_contribution", "clean_cycle", "manager_member_on_time"] as const;

export default async function ConnectAdmin({ searchParams }: { searchParams: Promise<{ statut?: string; source?: string; operateur?: string }> }) {
  const params = await searchParams;
  const t = await getTranslations("connectAdmin");
  const credit = await getTranslations("credit");
  const locale = (await getLocale()) as Locale;
  const money = (v: number) => formatMoney(v, "XOF", locale);
  const supabase = await createClient();
  const month = new Date().toISOString().slice(0, 7) + "-01";

  const status = STATUSES.find((s) => s === params.statut);
  const source = SOURCES.find((s) => s === params.source);
  const operator = OPERATORS.find((s) => s === params.operateur);
  let topupQuery = supabase
    .from("topups")
    .select("id, buyer_id, beneficiary_msisdn, operator, product_id, amount_xof, source, status, failure_code, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) topupQuery = topupQuery.eq("status", status);
  if (source) topupQuery = topupQuery.eq("source", source);
  if (operator) topupQuery = topupQuery.eq("operator", operator);

  const [{ data: rules }, { data: products }, { data: settings }, { data: budget }, { data: burn }, { data: topups }] = await Promise.all([
    supabase.from("reward_rules").select("trigger, product_id, active"),
    supabase.from("airtime_products").select("id, operator, type, label, data_mb, price_xof, active, sample").order("operator").order("type").order("price_xof"),
    supabase.from("reward_settings").select("per_user_monthly_cap_xof, default_monthly_budget_xof").maybeSingle(),
    supabase.from("reward_budgets").select("budget_xof, spent_xof").eq("month", month).maybeSingle(),
    supabase.rpc("admin_reward_burn"),
    topupQuery,
  ]);
  const buyers = [...new Set((topups ?? []).map((r) => r.buyer_id))];
  const { data: people } = buyers.length ? await supabase.from("profiles").select("id, full_name").in("id", buyers) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const label = new Map((products ?? []).map((p) => [p.id, p.label]));
  const dataProducts = (products ?? []).filter((p) => p.type === "data");
  const budgetXof = budget?.budget_xof ?? settings?.default_monthly_budget_xof ?? 0;
  const spent = budget?.spent_xof ?? 0;
  const maxDay = Math.max(1, ...(burn ?? []).map((d) => d.granted_xof));
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });
  const day = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>

      <Card>
        <CardTitle>{t("rules")}</CardTitle>
        <div className="flex flex-col gap-4">
          {TRIGGERS.map((trigger) => {
            const rule = (rules ?? []).find((r) => r.trigger === trigger);
            return (
              <RuleForm
                key={trigger}
                trigger={trigger}
                productId={rule?.product_id ?? ""}
                active={rule?.active ?? false}
                options={dataProducts.map((p) => ({ id: p.id, label: `${credit(`operators.${p.operator}`)} · ${formatVolume(p.data_mb!, locale)} · ${money(p.price_xof)}` }))}
              />
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle>{t("budget")}</CardTitle>
        <div>
          <p className="font-semibold tabular-nums">{t("burn", { spent: money(spent), budget: money(budgetXof) })}</p>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={t("burn", { spent: money(spent), budget: money(budgetXof) })}>
            <div className={cn("h-full rounded-full", spent / Math.max(1, budgetXof) > 0.9 ? "bg-destructive" : "bg-accent")} style={{ width: `${Math.min(100, (spent / Math.max(1, budgetXof)) * 100)}%` }} />
          </div>
        </div>
        <BudgetForm cap={settings?.per_user_monthly_cap_xof ?? 0} budget={budgetXof} />
        <h3 className="mt-2 text-sm font-semibold">{t("burnTitle")}</h3>
        {!burn?.length ? (
          <p className="text-sm text-muted-foreground">{t("noBurn")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {burn.map((d) => (
              <li key={d.day} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-sm">
                <span className="text-muted-foreground">{day.format(new Date(`${d.day}T12:00:00Z`))}</span>
                <span className="h-3 rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(d.granted_xof / maxDay) * 100}%` }} />
                </span>
                <span className="tabular-nums">
                  {money(d.granted_xof)} · {t("grants", { count: d.grants })}
                  {d.skipped ? ` · ${t("skipped", { count: d.skipped })}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>{t("catalogue")}</CardTitle>
        <ul className="divide-y">
          {(products ?? []).map((p) => (
            <ProductRow key={p.id} id={p.id} label={`${credit(`operators.${p.operator}`)} · ${p.label}`} price={p.price_xof} active={p.active} />
          ))}
        </ul>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("topups")}</h2>
        <form method="get" className="grid gap-2 sm:grid-cols-4">
          {(
            [
              ["statut", t("filters.status"), STATUSES, status, (s: string) => credit(`status.${s}` as "status.queued")],
              ["source", t("filters.source"), SOURCES, source, (s: string) => t(`sources.${s}` as "sources.card")],
              ["operateur", t("filters.operator"), OPERATORS, operator, (s: string) => credit(`operators.${s}` as "operators.orange")],
            ] as const
          ).map(([key, legend, options, value, show]) => (
            <label key={key} className="flex flex-col gap-1 text-sm font-medium">
              {legend}
              <select name={key} defaultValue={value ?? ""} className={inputClass}>
                <option value="">{t("filters.all")}</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {show(o)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button type="submit" className="min-h-12 self-end rounded-lg border px-4 font-semibold hover:bg-muted">
            {t("filters.apply")}
          </button>
        </form>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                {(["date", "buyer", "number", "product", "amount", "status"] as const).map((c) => (
                  <th key={c} className={cn("px-3 py-2 font-medium", c === "amount" && "text-right")}>
                    {t(`columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(topups ?? []).map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">{when.format(new Date(r.created_at))}</td>
                  <td className="px-3 py-2">
                    {name.get(r.buyer_id) ?? r.buyer_id.slice(0, 8)}
                    <span className="block text-xs text-muted-foreground">{t(`sources.${r.source}`)}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatMsisdn(r.beneficiary_msisdn)}</td>
                  <td className="px-3 py-2">
                    {credit(`operators.${r.operator}`)} · {label.get(r.product_id)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.amount_xof)}</td>
                  <td className="px-3 py-2">
                    {credit(`status.${r.status}`)}
                    {r.failure_code && <span className="block text-xs text-destructive">{r.failure_code}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
