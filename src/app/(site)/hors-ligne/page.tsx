import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/logo";

/** Shown by the service worker when a screen was never saved and there is no network. */
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 text-center">
      <Logo markClassName="size-10" />
      <WifiOff aria-hidden className="size-10 text-muted-foreground" />
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("lead")}</p>
      <Link href="/accueil" className="flex min-h-12 items-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground">
        {t("retry")}
      </Link>
    </main>
  );
}
