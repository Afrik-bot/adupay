import { getTranslations } from "next-intl/server";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("common");
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <p className="bg-accent px-4 py-1 text-center text-xs font-medium text-accent-foreground">{t("sandboxNotice")}</p>
      <main className="flex-1 px-4 pt-6 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
