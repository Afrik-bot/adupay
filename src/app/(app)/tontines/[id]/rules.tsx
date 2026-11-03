"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { proposeRules, voteRules, type RulesError } from "../actions";

interface Proposal {
  id: string;
  graceDays: number;
  latePenalty: number;
  penaltyLabel: string;
  proposerName: string;
  yes: number;
  no: number;
  myVote: boolean | null;
  voters: number;
}

export function RulesSection({
  groupId,
  status,
  isManager,
  canVote,
  contribution,
  rules,
  penaltyLabel,
  proposal,
}: {
  groupId: string;
  status: string;
  isManager: boolean;
  canVote: boolean;
  myId: string;
  contribution: number;
  rules: { graceDays: number; latePenalty: number };
  penaltyLabel: string;
  proposal: Proposal | null;
}) {
  const t = useTranslations("tontines.rules");
  const [editing, setEditing] = useState(false);
  const [grace, setGrace] = useState(String(rules.graceDays));
  const [penalty, setPenalty] = useState(String(rules.latePenalty));
  const [error, setError] = useState<RulesError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const started = status !== "draft";
  const canEdit = started ? canVote && !proposal : isManager;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseMoney(penalty || "0", "XOF");
    if (amount === null || amount > contribution) return setError("penalty");
    startTransition(async () => {
      const result = await proposeRules(groupId, Number(grace) || 0, amount);
      if ("error" in result) return setError(result.error);
      setError(null);
      setEditing(false);
      setNotice(t(`result.${result.result}`));
    });
  }

  return (
    <Card>
      <CardTitle>{t("title")}</CardTitle>
      <ul className="flex flex-col gap-1">
        <li>{t("grace", { days: rules.graceDays })}</li>
        <li>{rules.latePenalty ? t("penalty", { penalty: penaltyLabel }) : t("noPenalty")}</li>
      </ul>
      <p className="text-sm text-muted-foreground">{started ? t("voteNeeded") : t("managerEdits")}</p>

      {proposal && (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="font-semibold">{t("proposalTitle", { name: proposal.proposerName })}</p>
          <p>
            {t("grace", { days: proposal.graceDays })} ·{" "}
            {proposal.latePenalty ? t("penalty", { penalty: proposal.penaltyLabel }) : t("noPenalty")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("tally", { yes: proposal.yes, no: proposal.no, needed: Math.floor(proposal.voters / 2) + 1 })}
          </p>
          {canVote && (
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((approve) => (
                <Button
                  key={String(approve)}
                  variant={proposal.myVote === approve ? "default" : "outline"}
                  aria-pressed={proposal.myVote === approve}
                  disabled={pending}
                  onClick={() => startTransition(() => voteRules(groupId, proposal.id, approve))}
                >
                  {approve ? t("approve") : t("reject")}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className="font-medium text-success">
          {notice}
        </p>
      )}

      {canEdit &&
        (editing ? (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label={t("graceLabel")} htmlFor="ruleGrace">
              <input
                id="ruleGrace"
                type="number"
                min={0}
                max={30}
                inputMode="numeric"
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={t("penaltyLabel")} htmlFor="rulePenalty" error={error === "penalty" ? t("errors.penalty") : null}>
              <input
                id="rulePenalty"
                inputMode="numeric"
                value={penalty}
                onChange={(e) => setPenalty(e.target.value)}
                className={cn(inputClass, "tabular-nums")}
              />
            </Field>
            {error && error !== "penalty" && (
              <p role="alert" className="font-medium text-destructive">
                {t(`errors.${error}`)}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {started ? t("propose") : t("save")}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" onClick={() => setEditing(true)}>
            {started ? t("proposeChange") : t("edit")}
          </Button>
        ))}
    </Card>
  );
}
