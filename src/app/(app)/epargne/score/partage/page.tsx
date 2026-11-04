import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Check, X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/server/auth";
import { hasScoreSharingConsent } from "@/server/score";
import { ConsentForm, RevokeButton } from "./consent";

/** The explicit, revocable consent screen (recorded in consents) before any sharing. */
export default async function PartagePage() {
  await requireProfile();
  const t = await getTranslations("savings.consent");
  const sharing = await hasScoreSharingConsent();
  const shared = t.raw("shared") as string[];
  const notShared = t.raw("notShared") as string[];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/epargne/score" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {t("back")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("lead")}</p>
      </div>
      <Card>
        <CardTitle>{t("sharedTitle")}</CardTitle>
        <ul className="flex flex-col gap-2">
          {shared.map((s) => (
            <li key={s} className="flex gap-2">
              <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
              {s}
            </li>
          ))}
        </ul>
        <CardTitle>{t("notSharedTitle")}</CardTitle>
        <ul className="flex flex-col gap-2">
          {notShared.map((s) => (
            <li key={s} className="flex gap-2">
              <X aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
              {s}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardTitle>{t("withWhomTitle")}</CardTitle>
        <p className="text-muted-foreground">{t("withWhom")}</p>
        <p className="text-muted-foreground">{t("revocable")}</p>
      </Card>
      {sharing ? <RevokeButton /> : <ConsentForm />}
    </div>
  );
}
