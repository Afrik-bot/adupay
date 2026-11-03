import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { PaymentTimeline } from "@/components/payment-timeline";
import { Card } from "@/components/ui/card";
import { formatMoney, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** What family members see from a share link: no sign-in, limited details. */
export default async function SuiviPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("payFor");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data } = await supabase.rpc("directed_payment_public", { p_share_token: token });
  const dp = data?.[0];
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <Link href="/" className="w-fit text-lg text-foreground" aria-label="AduPay">
        <Logo />
      </Link>
      {!dp ? (
        <p className="rounded-xl border p-5">{t("track.notFound")}</p>
      ) : (
        <>
          <Card className="gap-2">
            <p className="text-sm text-muted-foreground">{t("track.from", { name: dp.sender_first_name ?? "" })}</p>
            <h1 className="text-2xl font-bold">{dp.payee_name ?? dp.group_name}</h1>
            <p className="text-3xl font-extrabold tabular-nums">{formatMoney(dp.amount ?? 0, "XOF", locale)}</p>
            <p className="text-muted-foreground">
              {t("forBeneficiary", { name: dp.beneficiary_name ?? "" })}
            </p>
          </Card>
          <Card>
            <PaymentTimeline
              format={(iso) => when.format(new Date(iso))}
              steps={[
                { label: t("timeline.paid"), at: dp.paid_at },
                { label: t("timeline.received"), at: dp.received_at, hint: t("timeline.receivedHint") },
                { label: t("timeline.confirmed"), at: dp.confirmed_at, hint: t("timeline.confirmedHint") },
              ]}
              failed={dp.status === "failed"}
              failedLabel={t("track.failed")}
            />
          </Card>
          <p className="text-xs text-muted-foreground">{t("track.privacy")}</p>
        </>
      )}
    </main>
  );
}
