import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatMoney, type Currency, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/server/auth";
import { JoinButton } from "./join-button";

export default async function RejoindrePage({ params }: { params: Promise<{ code: string }> }) {
  await requireProfile();
  const { code } = await params;
  const t = await getTranslations("tontines");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data } = await supabase.rpc("group_invite_preview", { p_invite_code: code });
  const group = data?.[0];

  if (!group) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{t("invite.notFoundTitle")}</h1>
        <p className="text-muted-foreground">{t("invite.notFound")}</p>
        <Link href="/tontines" className="font-semibold underline-offset-4 hover:underline">
          {t("title")}
        </Link>
      </div>
    );
  }
  if (group.already_member) redirect(`/tontines/${group.group_id}`);

  const pot = group.contribution_amount * group.member_limit;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm font-semibold text-muted-foreground">{t("invite.eyebrow", { manager: group.manager_name ?? "" })}</p>
      <Card className="gap-3">
        <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Users className="size-6" />
        </span>
        <h1 className="text-2xl font-bold">{group.name}</h1>
        <p className="text-lg font-semibold">
          {formatMoney(group.contribution_amount, group.currency as Currency, locale)} · {t(`frequency.${group.frequency}`)}
        </p>
        <p className="text-muted-foreground">{t("invite.members", { count: group.member_count, limit: group.member_limit })}</p>
        <p className="text-muted-foreground">
          {t("invite.potUpTo", { pot: formatMoney(pot, group.currency as Currency, locale) })} · {t(`order.${group.payout_order}`)}
        </p>
      </Card>
      {group.status === "draft" ? (
        <JoinButton code={code} />
      ) : (
        <p className="rounded-xl border bg-card p-4">{t("invite.started")}</p>
      )}
    </div>
  );
}
