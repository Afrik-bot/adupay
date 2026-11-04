import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { getSessionUser } from "@/server/auth";
import { PayeeNav } from "./nav";

// The business portal: signed-in, but without the personal onboarding or bottom bar.
export default async function PayeeLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSessionUser())) redirect("/connexion?next=/payee");
  const t = await getTranslations("payee");
  const common = await getTranslations("common");
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <p className="bg-accent px-4 py-1 text-center text-xs font-medium text-accent-foreground">{common("sandboxNotice")}</p>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <Link href="/payee" className="flex min-h-12 items-center gap-3 text-base text-foreground">
          <Logo markClassName="size-8" />
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{t("badge")}</span>
        </Link>
        <PayeeNav />
      </header>
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
