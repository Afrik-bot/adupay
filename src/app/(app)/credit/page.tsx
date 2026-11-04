import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { formatMsisdn, operatorFor, type Operator } from "@/lib/airtime";
import { formatMoney, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { requireProfile } from "@/server/auth";
import { TopupWizard, type WizardProduct } from "./wizard";

const STATUS_STYLE: Record<string, string> = {
  succeeded: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

export default async function CreditPage({ searchParams }: { searchParams: Promise<{ pour?: string; repeter?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const t = await getTranslations("credit");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const [{ data: products }, { data: saved }, { data: balances }, { data: linked }, { data: recent }] = await Promise.all([
    supabase.from("airtime_products").select("id, operator, type, label, data_mb, price_xof, validity_days").eq("active", true).order("price_xof"),
    supabase.from("saved_numbers").select("id, msisdn, name, operator").order("name"),
    supabase.rpc("my_balances"),
    supabase.from("linked_accounts").select("provider, account_masked, account_token, verified_at").eq("is_default", true).maybeSingle(),
    supabase.rpc("my_topups", { p_limit: 5 }),
  ]);
  const myNumber = profile.phone && operatorFor(profile.phone) ? profile.phone.replace(/\D/g, "") : null;
  const repeat = params.repeter ? (recent ?? []).find((r) => r.id === params.repeter) : undefined;
  const xof = balances?.find((b) => b.currency === "XOF")?.balance ?? 0;
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      <p className="rounded-lg bg-accent/40 p-3 text-sm">{t("sandbox")}</p>
      <TopupWizard
        products={(products ?? []) as WizardProduct[]}
        saved={(saved ?? []).map((s) => ({ ...s, operator: s.operator as Operator }))}
        myNumber={myNumber}
        balance={xof}
        mobileMoney={linked?.verified_at && linked.account_token ? linked.account_masked : null}
        allowCard={profile.user_type === "diaspora"}
        initial={
          repeat
            ? { who: myNumber && repeat.beneficiary_msisdn === myNumber ? "me" : "other", number: repeat.beneficiary_msisdn, name: repeat.beneficiary_name ?? "", operator: repeat.operator, productId: repeat.product_id }
            : { who: params.pour === "proche" || !myNumber ? "other" : "me" }
        }
      />
      <section aria-labelledby="recent-title" className="flex flex-col gap-3">
        <h2 id="recent-title" className="text-lg font-semibold">
          {t("recent")}
        </h2>
        {!recent?.length && <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{t("none")}</p>}
        <ul className="flex flex-col gap-2">
          {(recent ?? []).map((r) => (
            <li key={r.id}>
              <Link href={`/credit/${r.id}`} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.product_label}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {r.beneficiary_name ?? formatMsisdn(r.beneficiary_msisdn)} · {when.format(new Date(r.created_at))}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums">{formatMoney(r.amount_xof, "XOF", locale)}</span>
                  <span className={cn("rounded-full bg-muted px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[r.status])}>{t(`status.${r.status}`)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
