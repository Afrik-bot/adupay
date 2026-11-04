import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BottomNav } from "@/components/bottom-nav";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { OfflineBanner } from "@/components/pwa";
import { requireProfile } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireProfile();
  const t = await getTranslations("common");
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <OfflineBanner />
      <p className="bg-accent px-4 py-1 text-center text-xs font-medium text-accent-foreground">{t("sandboxNotice")}</p>
      <header className="flex items-center justify-between px-4 pt-3">
        <Link href="/" className="flex min-h-12 w-fit items-center text-base text-foreground" aria-label="AduPay">
          <Logo markClassName="size-8" />
        </Link>
        <Suspense fallback={<span className="size-12" />}>
          <NotificationBell />
        </Suspense>
      </header>
      <main className="flex-1 px-4 pt-4 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
