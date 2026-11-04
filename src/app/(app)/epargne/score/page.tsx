import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Lightbulb, ShieldCheck } from "lucide-react";
import { ScoreGauge } from "@/components/score-gauge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/server/auth";
import { getMyScore, hasScoreSharingConsent } from "@/server/score";

export default async function ScorePage() {
  await requireProfile();
  const t = await getTranslations("savings.score");
  const savings = await getTranslations("savings");
  const [score, sharing] = await Promise.all([getMyScore(), hasScoreSharingConsent()]);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/epargne" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {savings("title")}
      </Link>
      <Card className="items-center text-center">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <ScoreGauge score={score.score} label={t("aria", { score: score.score })} className="w-56 text-foreground" />
        <p className="text-lg font-semibold">{t(`bands.${score.band}`)}</p>
        <p className="text-sm text-muted-foreground">{t("what")}</p>
      </Card>

      <Card>
        <CardTitle>{t("breakdown")}</CardTitle>
        <ul className="flex flex-col gap-3">
          {score.components.map((c) => (
            <li key={c.part}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-medium">{t(`parts.${c.part}`)}</span>
                <span className="tabular-nums">
                  {c.points} / {c.max}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden>
                <div className="h-2 rounded-full bg-accent" style={{ width: `${(c.points / c.max) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t(`partHints.${c.part}`)}</p>
            </li>
          ))}
        </ul>
      </Card>

      {score.tips.length > 0 && (
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb aria-hidden className="size-5" />
            {t("improve")}
          </CardTitle>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {score.tips.map((tip) => (
              <li key={tip}>{t(`tips.${tip}`)}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck aria-hidden className="size-5" />
          {t("privacyTitle")}
        </CardTitle>
        <p className="text-muted-foreground">{sharing ? t("sharingOn") : t("sharingOff")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {sharing ? (
            <>
              <Button asChild>
                <Link href="/epargne/offres">{t("seeOffers")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/epargne/score/partage">{t("manageSharing")}</Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="outline">
              <Link href="/epargne/score/partage">{t("startSharing")}</Link>
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
