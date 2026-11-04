"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, GraduationCap, Home, Moon, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createGoal, type GoalFormError } from "../actions";

const KINDS = [
  { key: "school", icon: GraduationCap },
  { key: "tabaski", icon: Moon },
  { key: "rent", icon: Home },
  { key: "custom", icon: Target },
] as const;

export function GoalForm({ today }: { today: string }) {
  const t = useTranslations("savings.form");
  const savings = useTranslations("savings");
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("school");
  const [name, setName] = useState(savings("kinds.school"));
  const [target, setTarget] = useState("");
  const [lockUntil, setLockUntil] = useState("");
  const [weekly, setWeekly] = useState("");
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState<GoalFormError | null>(null);
  const [pending, startTransition] = useTransition();
  const err = (k: GoalFormError) => (error === k ? t(`errors.${k}`) : null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const targetAmount = parseMoney(target, "XOF");
    const weeklyAmount = weekly.trim() ? parseMoney(weekly, "XOF") : null;
    if (!targetAmount) return setError("target");
    if (weekly.trim() && !weeklyAmount) return setError("weekly");
    startTransition(async () => {
      const result = await createGoal({ kind, name, target: targetAmount, lockUntil, weekly: weeklyAmount, auto: auto && weeklyAmount !== null });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Link href="/epargne" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {savings("title")}
      </Link>
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 text-sm font-semibold">{t("kind")}</legend>
        {KINDS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={kind === key}
            onClick={() => {
              setKind(key);
              setName(key === "custom" ? "" : savings(`kinds.${key}`));
            }}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 bg-card p-2 text-sm font-semibold",
              kind === key ? "border-primary" : "border-border text-muted-foreground",
            )}
          >
            <Icon aria-hidden className="size-6" />
            {savings(`kinds.${key}`)}
          </button>
        ))}
      </fieldset>

      <Field label={t("name")} htmlFor="goalName" error={err("name")}>
        <input id="goalName" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} />
      </Field>
      <Field label={t("target")} htmlFor="goalTarget" error={err("target")}>
        <div className="flex">
          <input id="goalTarget" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="150 000" className={cn(inputClass, "rounded-r-none tabular-nums")} />
          <span className="flex min-h-12 items-center rounded-r-lg border border-l-0 bg-muted px-3 font-medium">FCFA</span>
        </div>
      </Field>
      <Field label={t("lockUntil")} htmlFor="goalLock" hint={t("lockHint")} error={err("lockDate")}>
        <input id="goalLock" type="date" min={today} value={lockUntil} onChange={(e) => setLockUntil(e.target.value)} className={inputClass} />
      </Field>
      <Field label={t("weekly")} htmlFor="goalWeekly" hint={t("weeklyHint")} error={err("weekly")}>
        <div className="flex">
          <input id="goalWeekly" inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value)} placeholder="5 000" className={cn(inputClass, "rounded-r-none tabular-nums")} />
          <span className="flex min-h-12 items-center rounded-r-lg border border-l-0 bg-muted px-3 font-medium">FCFA</span>
        </div>
      </Field>
      <label className={cn("flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4", !weekly.trim() && "opacity-50")}>
        <input type="checkbox" checked={auto} disabled={!weekly.trim()} onChange={(e) => setAuto(e.target.checked)} className="size-5" />
        <span>
          <span className="block font-medium">{t("auto")}</span>
          <span className="block text-sm text-muted-foreground">{t("autoHint")}</span>
        </span>
      </label>
      {error === "generic" && (
        <p role="alert" className="font-medium text-destructive">
          {t("errors.generic")}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
