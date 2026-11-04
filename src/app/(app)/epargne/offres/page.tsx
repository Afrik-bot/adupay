import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, type Locale } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireProfile } from "@/server/auth";
import { getMyScore, hasScoreSharingConsent } from "@/server/score";

// Illustrative offers only: no real lender, no real rates. Replaced by partner
// offers (via the PRD's partner API) once licensed lenders sign.
const SAMPLE_OFFERS = [
  { key: "stock", minScore: 30, min: 50_000, max: 300_000, months: 3 },
  { key: "school", minScore: 50, min: 100_000, max: 500_000, months: 6 },
  { key: "equipment", minScore: 70, min: 250_000, max: 1_500_000, months: 12 },
] as const;

/** Shown only after the member has given (and not revoked) consent. */
export default async function OffresPage() {
  await requireProfile();
  if (!(await hasScoreSharingConsent())) redirect("/epargne/score/partage");
  const t = await getTranslations("savings.offers");
  const locale = (await getLocale()) as Locale;
  const score = await getMyScore();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/epargne/score" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {t("back")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("lead", { score: score.score })}</p>
      </div>
      <p className="flex items-start gap-2 rounded-xl border-2 border-dashed border-warning bg-warning/10 p-4 text-sm font-medium">
        <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0" />
        {t("sampleBanner")}
      </p>
      <ul className="flex flex-col gap-3">
        {SAMPLE_OFFERS.map((offer) => {
          const eligible = score.score >= offer.minScore;
          return (
            <li key={offer.key}>
              <Card className={cn(!eligible && "opacity-60")}>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>{t(`items.${offer.key}.name`)}</CardTitle>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{t("sampleTag")}</span>
                </div>
                <p className="text-muted-foreground">{t(`items.${offer.key}.purpose`)}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">{t("amount")}</dt>
                  <dd>
                    {formatMoney(offer.min, "XOF", locale)} – {formatMoney(offer.max, "XOF", locale)}
                  </dd>
                  <dt className="text-muted-foreground">{t("duration")}</dt>
                  <dd>{t("months", { months: offer.months })}</dd>
                  <dt className="text-muted-foreground">{t("rate")}</dt>
                  <dd>{t("rateTbd")}</dd>
                  <dt className="text-muted-foreground">{t("lender")}</dt>
                  <dd>{t("lenderTbd")}</dd>
                </dl>
                <p className={cn("text-sm font-semibold", eligible ? "text-success" : "text-muted-foreground")}>
                  {eligible ? t("eligible") : t("notYet", { score: offer.minScore })}
                </p>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}
