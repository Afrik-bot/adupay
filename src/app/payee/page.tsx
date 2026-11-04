import { getLocale, getTranslations } from "next-intl/server";
import { Clock, Download, XCircle } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { inputClass } from "@/components/ui/field";
import { formatMoney, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getSessionUser } from "@/server/auth";
import { ConfirmButton } from "./confirm-button";
import { RegisterForm } from "./register-form";

const FILTERS = ["to_confirm", "confirmed", "all"] as const;
type Filter = (typeof FILTERS)[number];

export default async function PayeePortalPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; du?: string; au?: string; q?: string }>;
}) {
  const user = (await getSessionUser())!;
  const params = await searchParams;
  const t = await getTranslations("payee");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: payee } = await supabase
    .from("payees")
    .select("id, name, category, city, kyb_status, rejection_reason, submitted_at")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!payee) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">{t("welcomeTitle")}</h1>
          <p className="mt-1 text-muted-foreground">{t("welcomeLead")}</p>
        </div>
        <RegisterForm userId={user.id} />
      </div>
    );
  }

  if (payee.kyb_status !== "approved") {
    const rejected = payee.kyb_status === "rejected";
    return (
      <Card className="items-start gap-3">
        {rejected ? <XCircle aria-hidden className="size-10 text-destructive" /> : <Clock aria-hidden className="size-10 text-warning" />}
        <CardTitle>{payee.name}</CardTitle>
        <CardDescription>{rejected ? t("rejected", { reason: payee.rejection_reason ?? "" }) : t("pending")}</CardDescription>
        {!rejected && <p className="text-sm text-muted-foreground">{t("pendingHint")}</p>}
      </Card>
    );
  }

  const filter: Filter = FILTERS.includes(params.statut as Filter) ? (params.statut as Filter) : "to_confirm";
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const { data: rows } = await supabase.rpc("payee_incoming", {
    p_status: filter,
    p_from: date(params.du) ?? undefined,
    p_to: date(params.au) ?? undefined,
    p_search: params.q?.slice(0, 60) ?? undefined,
  });
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });
  const total = (rows ?? []).reduce((sum, r) => sum + r.amount, 0);
  const query = new URLSearchParams({ statut: filter, ...(date(params.du) ? { du: params.du! } : {}), ...(date(params.au) ? { au: params.au! } : {}), ...(params.q ? { q: params.q } : {}) });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{payee.name}</h1>
        <p className="text-muted-foreground">{t("dashboardLead")}</p>
      </div>

      <nav aria-label={t("filters.label")} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {FILTERS.map((f) => (
          <a
            key={f}
            href={`/payee?${new URLSearchParams({ ...Object.fromEntries(query), statut: f })}`}
            aria-current={filter === f ? "page" : undefined}
            className={cn("flex min-h-12 items-center justify-center rounded-md text-sm font-semibold", filter === f ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {t(`filters.${f}`)}
          </a>
        ))}
      </nav>

      <form method="get" className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input type="hidden" name="statut" value={filter} />
        <label className="sr-only" htmlFor="q">
          {t("filters.search")}
        </label>
        <input id="q" name="q" defaultValue={params.q ?? ""} placeholder={t("filters.searchPlaceholder")} className={inputClass} />
        <label className="sr-only" htmlFor="du">
          {t("filters.from")}
        </label>
        <input id="du" name="du" type="date" defaultValue={date(params.du) ?? ""} className={inputClass} />
        <label className="sr-only" htmlFor="au">
          {t("filters.to")}
        </label>
        <input id="au" name="au" type="date" defaultValue={date(params.au) ?? ""} className={inputClass} />
        <button type="submit" className="min-h-12 rounded-lg border px-4 font-semibold hover:bg-muted">
          {t("filters.apply")}
        </button>
      </form>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("count", { count: rows?.length ?? 0, total: formatMoney(total, "XOF", locale) })}</p>
        <a href={`/api/payee/export?${query}`} className="flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm font-semibold hover:bg-muted">
          <Download aria-hidden className="size-4" />
          {t("exportCsv")}
        </a>
      </div>

      {rows?.length ? (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.beneficiary_name}</p>
                    {r.reference && <p className="text-sm">{r.reference}</p>}
                    <p className="text-sm text-muted-foreground">
                      {t("from", { name: r.sender_first_name ?? "", country: r.sender_country ?? "" })} · {when.format(new Date(r.created_at))}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold tabular-nums">{formatMoney(r.amount, "XOF", locale)}</p>
                </div>
                {r.status === "confirmed" ? (
                  <p className="text-sm font-semibold text-success">{t("confirmedOn", { date: when.format(new Date(r.confirmed_at!)) })}</p>
                ) : r.status === "received" ? (
                  <ConfirmButton id={r.id} />
                ) : (
                  <p className="text-sm text-warning">{t("onTheWay")}</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>
      )}
    </div>
  );
}
