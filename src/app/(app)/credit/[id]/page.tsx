import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { PaymentTimeline } from "@/components/payment-timeline";
import { Card } from "@/components/ui/card";
import { formatMsisdn } from "@/lib/airtime";
import { formatMoney, type Currency, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/server/auth";
import { AutoRefresh } from "../../tontines/[id]/recu/[paymentId]/auto-refresh";
import { SaveNumberButton } from "./save-number";

export default async function TopupReceipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const profile = await requireProfile();
  const t = await getTranslations("credit");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  // RLS: only the buyer (or staff) can read it.
  const { data: topup } = await supabase
    .from("topups")
    .select("id, beneficiary_msisdn, beneficiary_name, operator, product_id, amount_xof, source, status, source_currency, source_amount, attempts, failure_code, created_at, updated_at, delivered_at, payment_id")
    .eq("id", id)
    .maybeSingle();
  if (!topup) notFound();
  const [{ data: product }, { data: saved }] = await Promise.all([
    supabase.from("airtime_products").select("label").eq("id", topup.product_id).maybeSingle(),
    supabase.from("saved_numbers").select("id").eq("msisdn", topup.beneficiary_msisdn).maybeSingle(),
  ]);
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });
  const final = topup.status === "succeeded" || topup.status === "failed";
  const paymentFailed = topup.status === "failed" && topup.attempts === 0;
  const paidAt = topup.status === "awaiting_payment" || paymentFailed ? null : topup.created_at;
  const sentAt = ["pending", "succeeded"].includes(topup.status) || (topup.status === "failed" && !paymentFailed) ? topup.updated_at : null;
  const mine = profile.phone?.replace(/\D/g, "") === topup.beneficiary_msisdn;
  const name = topup.beneficiary_name ?? formatMsisdn(topup.beneficiary_msisdn);

  return (
    <div className="flex flex-col gap-6">
      {!final && <AutoRefresh />}
      <Link href="/credit" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {t("receipt.back")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t("receipt.title")}</h1>
        <p className="text-muted-foreground">{t("receipt.for", { product: product?.label ?? "", name })}</p>
      </div>
      <Card>
        <p className="text-3xl font-extrabold tabular-nums">{formatMoney(topup.amount_xof, "XOF", locale)}</p>
        {topup.source === "card" && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("review.charged")} : {formatMoney(topup.source_amount, topup.source_currency as Currency, locale)}
          </p>
        )}
        <p className="text-sm tabular-nums">
          {formatMsisdn(topup.beneficiary_msisdn)} · {t(`operators.${topup.operator}`)}
        </p>
      </Card>
      <PaymentTimeline
        steps={[
          { label: t("receipt.timeline.paid"), at: paidAt, hint: t("receipt.timeline.paidWaiting") },
          { label: t("receipt.timeline.sent"), at: sentAt, hint: t("receipt.timeline.sentWaiting") },
          { label: t("receipt.timeline.delivered"), at: topup.delivered_at, hint: t("receipt.timeline.deliveredWaiting") },
        ]}
        failed={topup.status === "failed"}
        failedLabel={t(paymentFailed ? "receipt.timeline.paymentFailed" : "receipt.timeline.failed", { code: topup.failure_code ?? "" })}
        format={(iso) => when.format(new Date(iso))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/credit?repeter=${topup.id}`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
        >
          <RotateCcw aria-hidden className="size-5" />
          {t("receipt.repeat")}
        </Link>
        {!mine && <SaveNumberButton msisdn={topup.beneficiary_msisdn} name={topup.beneficiary_name ?? ""} operator={topup.operator} saved={Boolean(saved)} />}
      </div>
    </div>
  );
}
