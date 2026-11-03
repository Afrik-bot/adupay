import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Check, Crown, Gift } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, type Currency, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { requireProfile } from "@/server/auth";
import { serverEnv } from "@/server/env";
import { InviteShare, PayShareButton, StartButton } from "./controls";
import { RulesSection } from "./rules";

export default async function TontinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nouvelle?: string }>;
}) {
  const profile = await requireProfile();
  const { id } = await params;
  const { nouvelle } = await searchParams;
  const t = await getTranslations("tontines");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();

  const { data: group } = await supabase.from("groups").select("*").eq("id", id).maybeSingle();
  if (!group) notFound();

  const [{ data: rules }, { data: members }, { data: cycle }, { data: ledger }, { data: proposal }] = await Promise.all([
    supabase.from("group_rules").select("grace_days, late_penalty_amount").eq("group_id", id).single(),
    supabase.rpc("group_members_status", { p_group_id: id }),
    supabase
      .from("cycles")
      .select("id, number, due_date, recipient_id, status")
      .eq("group_id", id)
      .in("status", ["open", "collecting"])
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("group_ledger", { p_group_id: id, p_limit: 30 }),
    supabase
      .from("group_rule_proposals")
      .select("id, proposed_by, grace_days, late_penalty_amount")
      .eq("group_id", id)
      .eq("status", "open")
      .maybeSingle(),
  ]);
  const { data: votes } = proposal
    ? await supabase.from("group_rule_votes").select("user_id, approve").eq("proposal_id", proposal.id)
    : { data: [] as { user_id: string; approve: boolean }[] };

  const currency = group.currency as Currency;
  const money = (v: number) => formatMoney(v, currency, locale);
  const rotation = (members ?? []).filter((m) => m.role !== "sponsor");
  const me = (members ?? []).find((m) => m.is_me);
  const isManager = group.manager_id === profile.id;
  const paidCount = rotation.filter((m) => m.paid_current).length;
  const myShareMember = me?.role === "sponsor" ? rotation.find((m) => m.user_id === me.sponsored_member_id) : me;
  const recipient = rotation.find((m) => m.is_recipient);
  const dateFormat = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { day: "numeric", month: "long" });
  const timeFormat = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Abidjan",
  });
  const inviteUrl = new URL(`/rejoindre/${group.invite_code}`, serverEnv.appUrl()).toString();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/tontines" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {t("title")}
      </Link>

      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{group.name}</h1>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              group.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {t(`status.${group.status}`)}
          </span>
        </div>
        <p className="mt-1 text-muted-foreground">
          {money(group.contribution_amount)} · {t(`frequency.${group.frequency}`)} · {t(`order.${group.payout_order}`)}
        </p>
      </div>

      {nouvelle && group.status === "draft" && (
        <p role="status" className="rounded-xl bg-success/15 p-4 font-medium text-success">
          {t("group.created")}
        </p>
      )}

      {group.status === "draft" ? (
        <>
          <InviteShare
            url={inviteUrl}
            code={group.invite_code}
            message={t("group.inviteMessage", { name: group.name, amount: money(group.contribution_amount), url: inviteUrl })}
          />
          <Card>
            <CardTitle>{t("group.waitingTitle", { count: rotation.length, limit: group.member_limit })}</CardTitle>
            <p className="text-muted-foreground">
              {t("group.startsOn", { date: dateFormat.format(new Date(`${group.start_date}T00:00:00`)) })}
            </p>
            {isManager ? (
              <StartButton groupId={id} disabled={rotation.length < 2} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("group.waitForManager")}</p>
            )}
          </Card>
        </>
      ) : (
        cycle && (
          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <CardTitle>{t("group.round", { number: cycle.number, total: rotation.length })}</CardTitle>
              <span className="text-sm text-muted-foreground">
                {t("group.dueBy", { date: dateFormat.format(new Date(`${cycle.due_date}T00:00:00`)) })}
              </span>
            </div>
            <div>
              <div className="flex justify-between text-sm font-medium">
                <span>{t("group.paidCount", { paid: paidCount, total: rotation.length })}</span>
                <span className="tabular-nums">
                  {money(paidCount * group.contribution_amount)} / {money(rotation.length * group.contribution_amount)}
                </span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-muted" aria-hidden>
                <div className="h-3 rounded-full bg-accent" style={{ width: `${(paidCount / Math.max(1, rotation.length)) * 100}%` }} />
              </div>
            </div>
            {recipient && (
              <p className="flex items-center gap-2">
                <Gift aria-hidden className="size-5 shrink-0" />
                {recipient.is_me ? t("group.recipientMe") : t("group.recipient", { name: recipient.full_name ?? "" })}
              </p>
            )}
            {myShareMember &&
              (myShareMember.paid_current ? (
                <p className="flex items-center gap-2 font-semibold text-success">
                  <Check aria-hidden className="size-5" />
                  {me?.role === "sponsor"
                    ? t("group.sponsorPaid", { name: myShareMember.full_name ?? "" })
                    : t("group.youPaid")}
                </p>
              ) : (
                <PayShareButton
                  groupId={id}
                  label={
                    me?.role === "sponsor"
                      ? t("group.payFor", { name: myShareMember.full_name ?? "", amount: money(group.contribution_amount) })
                      : t("group.payMyShare", { amount: money(group.contribution_amount) })
                  }
                />
              ))}
          </Card>
        )
      )}

      <section aria-labelledby="members-title" className="flex flex-col gap-3">
        <h2 id="members-title" className="text-lg font-semibold">
          {t("group.members")}
        </h2>
        <ul className="divide-y rounded-xl border bg-card">
          {rotation.map((m) => (
            <li key={m.user_id} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="w-8 shrink-0 text-center font-semibold tabular-nums text-muted-foreground">
                {m.payout_position ?? "–"}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {m.full_name}
                {m.is_me && <span className="text-muted-foreground"> ({t("group.you")})</span>}
              </span>
              {m.role === "manager" && <Crown aria-label={t("group.manager")} className="size-4 shrink-0 text-warning" />}
              {group.status === "active" && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    m.paid_current ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                  )}
                >
                  {m.paid_current ? t("group.paid") : t("group.unpaid")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {rules && (
        <RulesSection
          groupId={id}
          status={group.status}
          isManager={isManager}
          canVote={Boolean(me && me.role !== "sponsor")}
          myId={profile.id}
          contribution={group.contribution_amount}
          rules={{ graceDays: rules.grace_days, latePenalty: rules.late_penalty_amount }}
          penaltyLabel={money(rules.late_penalty_amount)}
          proposal={
            proposal
              ? {
                  id: proposal.id,
                  graceDays: proposal.grace_days,
                  latePenalty: proposal.late_penalty_amount,
                  penaltyLabel: money(proposal.late_penalty_amount),
                  proposerName: rotation.find((m) => m.user_id === proposal.proposed_by)?.full_name ?? "",
                  yes: (votes ?? []).filter((v) => v.approve).length,
                  no: (votes ?? []).filter((v) => !v.approve).length,
                  myVote: (votes ?? []).find((v) => v.user_id === profile.id)?.approve ?? null,
                  voters: rotation.length,
                }
              : null
          }
        />
      )}

      <section aria-labelledby="ledger-title" className="flex flex-col gap-3">
        <h2 id="ledger-title" className="text-lg font-semibold">
          {t("group.ledger")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("group.ledgerHint")}</p>
        {ledger?.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {ledger.map((e) => (
              <li key={e.entry_id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {t(`ledgerKind.${e.kind}` as "ledgerKind.collect", { name: e.member_name ?? "" })}
                    {e.cycle_number ? ` · ${t("group.roundShort", { number: e.cycle_number })}` : ""}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {timeFormat.format(new Date(e.created_at))}
                    {e.rail_reference ? ` · ${t("group.reference")} ${e.rail_reference.slice(-10)}` : ""}
                  </span>
                </span>
                <span className={cn("font-semibold tabular-nums", e.side === "credit" ? "text-success" : "")}>
                  {e.side === "credit" ? "+" : "−"}
                  {formatMoney(e.amount, e.currency as Currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{t("group.ledgerEmpty")}</p>
        )}
      </section>
    </div>
  );
}
