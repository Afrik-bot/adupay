import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, LayoutDashboard, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, type Currency, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { requireProfile } from "@/server/auth";
import { JoinByCode } from "./join-by-code";

export default async function TontinesPage() {
  await requireProfile();
  const t = await getTranslations("tontines");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: groups } = await supabase.rpc("my_groups");
  const dateFormat = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button asChild size="sm">
          <Link href="/tontines/nouvelle">
            <Plus aria-hidden />
            {t("createLabel")}
          </Link>
        </Button>
      </div>

      {groups?.some((g) => g.my_role === "manager") && (
        <Link
          href="/tontines/gestion"
          className="flex min-h-14 items-center justify-between gap-3 rounded-xl border-2 border-accent bg-card px-4 font-semibold hover:bg-muted"
        >
          <span className="flex items-center gap-3">
            <LayoutDashboard aria-hidden className="size-5" />
            {t("managerSpace")}
          </span>
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      )}

      {groups?.length ? (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <li key={g.group_id}>
              <Link href={`/tontines/${g.group_id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted">
                <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Users className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {formatMoney(g.contribution_amount, g.currency as Currency, locale)} · {t(`frequency.${g.frequency}`)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {g.status === "draft"
                      ? t("list.draft", { count: g.member_count })
                      : g.my_position
                        ? t("list.position", { position: g.my_position, total: g.member_count })
                        : t("list.sponsor")}
                    {g.status === "active" && g.next_due_date
                      ? ` · ${t("list.nextDue", { date: dateFormat.format(new Date(`${g.next_due_date}T00:00:00`)) })}`
                      : ""}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    g.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {t(`status.${g.status}`)}
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>
      )}

      <JoinByCode />
    </div>
  );
}
