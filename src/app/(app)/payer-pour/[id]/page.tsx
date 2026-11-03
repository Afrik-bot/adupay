import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Download } from "lucide-react";
import { PaymentTimeline } from "@/components/payment-timeline";
import { Card } from "@/components/ui/card";
import { formatMoney, type Currency, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/server/auth";
import { serverEnv } from "@/server/env";
import { AutoRefresh } from "../../tontines/[id]/recu/[paymentId]/auto-refresh";
import { ShareWithFamily } from "./share";

export default async function DirectedPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  const t = await getTranslations("payFor");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: dp } = await supabase
    .from("directed_payments")
    .select(
      "id, purpose, payee_id, group_id, beneficiary_name, reference, amount, source_currency, source_amount, fee_amount, fx_rate, status, share_token, card_brand, card_last4, created_at, paid_at, received_at, confirmed_at, failure_code",
    )
    .eq("id", id)
    .maybeSingle();
  if (!dp) notFound();
  const { data: target } =
    dp.purpose === "tontine"
      ? await supabase.from("groups").select("name").eq("id", dp.group_id!).maybeSingle()
      : await supabase.from("payees").select("name").eq("id", dp.payee_id!).maybeSingle();

  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });
  const payeeName = target?.name;
  const shareUrl = new URL(`/suivi/${dp.share_token}`, serverEnv.appUrl()).toString();
  const moving = dp.status === "initiated" || dp.status === "paid";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/payer-pour" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {t("title")}
      </Link>
      <Card className="gap-2">
        <p className="text-sm text-muted-foreground">{t(`purposes.${dp.purpose}`)}</p>
        <h1 className="text-2xl font-bold">{payeeName}</h1>
        <p className="text-3xl font-extrabold tabular-nums">{formatMoney(dp.amount, "XOF", locale)}</p>
        <p className="text-muted-foreground">
          {t("forBeneficiary", { name: dp.beneficiary_name })}
          {dp.reference ? ` · ${dp.reference}` : ""}
        </p>
      </Card>

      <Card>
        <PaymentTimeline
          format={(iso) => when.format(new Date(iso))}
          steps={[
            { label: t("timeline.paid"), at: dp.paid_at, hint: dp.status === "initiated" ? t("timeline.paidWaiting") : undefined },
            { label: t("timeline.received"), at: dp.received_at, hint: t("timeline.receivedHint") },
            { label: t("timeline.confirmed"), at: dp.confirmed_at, hint: t("timeline.confirmedHint") },
          ]}
          failed={dp.status === "failed"}
          failedLabel={t("timeline.failed", { code: dp.failure_code ?? "" })}
        />
      </Card>

      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("charged")}</dt>
          <dd className="text-right font-semibold tabular-nums">{formatMoney(dp.source_amount, dp.source_currency as Currency, locale)}</dd>
          <dt className="text-muted-foreground">{t("feeIncluded")}</dt>
          <dd className="text-right tabular-nums">{formatMoney(dp.fee_amount, dp.source_currency as Currency, locale)}</dd>
          <dt className="text-muted-foreground">{t("rate")}</dt>
          <dd className="text-right tabular-nums">
            1 {dp.source_currency} = {Number(dp.fx_rate).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 3 })} FCFA
          </dd>
          {dp.card_last4 && (
            <>
              <dt className="text-muted-foreground">{t("card")}</dt>
              <dd className="text-right">•••• {dp.card_last4}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t("date")}</dt>
          <dd className="text-right">{when.format(new Date(dp.created_at))}</dd>
        </dl>
        <a
          href={`/api/payer-pour/${dp.id}/recu`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border font-semibold hover:bg-muted"
        >
          <Download aria-hidden className="size-5" />
          {t("downloadReceipt")}
        </a>
      </Card>

      {dp.status !== "failed" && (
        <ShareWithFamily url={shareUrl} message={t("shareMessage", { payee: payeeName ?? "", amount: formatMoney(dp.amount, "XOF", locale), url: shareUrl })} />
      )}
      {moving && <AutoRefresh />}
    </div>
  );
}
