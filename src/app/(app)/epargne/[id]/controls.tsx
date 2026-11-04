"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass } from "@/components/ui/field";
import { parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { addToGoal, setAutoTopup, withdrawGoal } from "../actions";
import type { SavingsError } from "@/server/savings";

const FIX: Partial<Record<SavingsError, string>> = { noAccount: "/profil/comptes", kycRequired: "/profil/verification" };

export function MoneyMove({ goalId, locked, balance }: { goalId: string; locked: boolean; balance: number }) {
  const t = useTranslations("savings.move");
  const [mode, setMode] = useState<"add" | "withdraw">("add");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string; fix?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const value = parseMoney(amount, "XOF");
    if (!value) return setMessage({ ok: false, text: t("errors.amount") });
    startTransition(async () => {
      const key = crypto.randomUUID();
      const result = mode === "add" ? await addToGoal(goalId, value, key) : await withdrawGoal(goalId, value, key);
      if ("ok" in result) {
        setAmount("");
        setMessage({ ok: true, text: mode === "add" ? t("added") : t("withdrawn") });
      } else {
        setMessage({ ok: false, text: t(`errors.${result.error}`), fix: FIX[result.error as SavingsError] });
      }
    });
  }

  return (
    <Card>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(["add", "withdraw"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setMessage(null);
            }}
            className={cn("flex min-h-12 items-center justify-center gap-2 rounded-md text-sm font-semibold", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {m === "add" ? <ArrowDownToLine aria-hidden className="size-4" /> : <ArrowUpFromLine aria-hidden className="size-4" />}
            {t(m)}
          </button>
        ))}
      </div>
      {mode === "withdraw" && locked ? (
        <p className="text-sm">{t("lockedNote")}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="moveAmount" className="text-sm font-semibold">
            {mode === "add" ? t("addLabel") : t("withdrawLabel")}
          </label>
          <div className="flex">
            <input id="moveAmount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5 000" className={cn(inputClass, "rounded-r-none tabular-nums")} />
            <span className="flex min-h-12 items-center rounded-r-lg border border-l-0 bg-muted px-3 font-medium">FCFA</span>
          </div>
          <p className="text-xs text-muted-foreground">{mode === "add" ? t("addHint") : t("withdrawHint")}</p>
          {message && (
            <p role={message.ok ? "status" : "alert"} className={cn("text-sm font-medium", message.ok ? "text-success" : "text-destructive")}>
              {message.text}{" "}
              {message.fix && (
                <Link href={message.fix} className="underline underline-offset-4">
                  {t("fix")}
                </Link>
              )}
            </p>
          )}
          <Button type="submit" variant={mode === "add" ? "accent" : "outline"} disabled={pending || (mode === "withdraw" && balance === 0)}>
            {mode === "add" ? t("addSubmit") : t("withdrawSubmit")}
          </Button>
        </form>
      )}
    </Card>
  );
}

export function AutoToggle({ goalId, on, amount }: { goalId: string; on: boolean; amount: string }) {
  const t = useTranslations("savings");
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4">
      <input type="checkbox" checked={on} disabled={pending} onChange={(e) => startTransition(() => setAutoTopup(goalId, e.target.checked))} className="size-5" />
      <span>
        <span className="block font-medium">{t("autoLabel", { amount })}</span>
        <span className="block text-sm text-muted-foreground">{t("autoHint")}</span>
      </span>
    </label>
  );
}
