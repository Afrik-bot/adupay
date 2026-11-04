import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";
import { AdminNav } from "./nav";

// Admin and compliance staff only. Everyone else gets a plain 404, so the
// console's existence isn't advertised.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSessionUser())) redirect("/connexion?next=/admin");
  const supabase = await createClient();
  const { data: staff } = await supabase.rpc("is_staff");
  if (!staff) notFound();
  const t = await getTranslations("admin");
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <Link href="/admin" className="flex min-h-12 items-center gap-3 text-base text-foreground">
          <Logo markClassName="size-8" />
          <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">{t("badge")}</span>
        </Link>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <AdminNav />
        <main className="min-w-0 flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
