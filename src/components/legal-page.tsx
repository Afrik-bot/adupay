import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";

/** Placeholder for legal documents until counsel-reviewed texts exist. */
export async function LegalPage({ document }: { document: "terms" | "privacy" | "complaints" }) {
  const t = await getTranslations("legal");
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-10">
      <Link href="/" className="w-fit text-lg text-foreground" aria-label="AduPay">
        <Logo />
      </Link>
      <h1 className="text-3xl font-bold">{t(document)}</h1>
      <p className="text-lg text-muted-foreground">{t("draft")}</p>
      <Link href="/" className="flex min-h-12 w-fit items-center gap-2 font-semibold underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden className="size-5" />
        {t("back")}
      </Link>
    </main>
  );
}
