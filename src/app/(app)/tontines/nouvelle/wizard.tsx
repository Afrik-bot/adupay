"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { formatMoney, parseMoney, type Locale } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createTontine, type CreateTontineError } from "../actions";

const STEPS = 4;
const FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
const ORDERS = ["fixed", "lottery", "vote"] as const;

function Option({ selected, onSelect, title, hint }: { selected: boolean; onSelect: () => void; title: string; hint?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 w-full flex-col justify-center rounded-xl border-2 bg-card px-4 py-3 text-left",
        selected ? "border-primary" : "border-border hover:border-muted-foreground",
      )}
    >
      <span className="font-semibold">{title}</span>
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
    </button>
  );
}

export function CreateTontineWizard({ locale, today }: { locale: string; today: string }) {
  const t = useTranslations("tontines.create");
  const tf = useTranslations("tontines");
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>("weekly");
  const [startDate, setStartDate] = useState(today);
  const [memberLimit, setMemberLimit] = useState("10");
  const [payoutOrder, setPayoutOrder] = useState<(typeof ORDERS)[number]>("lottery");
  const [graceDays, setGraceDays] = useState("2");
  const [penaltyText, setPenaltyText] = useState("0");
  const [error, setError] = useState<CreateTontineError | null>(null);
  const [pending, startTransition] = useTransition();

  const amount = parseMoney(amountText, "XOF");
  const penalty = parseMoney(penaltyText || "0", "XOF");
  const members = Number(memberLimit);
  const money = (v: number) => formatMoney(v, "XOF", locale as Locale);

  function next() {
    setError(null);
    if (step === 1) {
      if (name.trim().length < 2) return setError("name");
      if (!amount || amount < 500 || amount > 2_000_000) return setError("amount");
    }
    if (step === 2) {
      if (!startDate || startDate < today) return setError("startDate");
      if (!Number.isInteger(members) || members < 2 || members > 100) return setError("limit");
    }
    if (step === 4 && (penalty === null || penalty > (amount ?? 0))) return setError("penalty");
    setStep((s) => s + 1);
  }

  function save() {
    startTransition(async () => {
      const result = await createTontine({
        name,
        amount: amount!,
        frequency,
        startDate,
        memberLimit: members,
        payoutOrder,
        graceDays: Number(graceDays) || 0,
        latePenalty: penalty ?? 0,
      });
      if (result?.error) setError(result.error);
    });
  }

  const errorText = (key: CreateTontineError) => (error === key ? t(`errors.${key}`) : null);
  const dateLabel = startDate
    ? new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(`${startDate}T00:00:00`),
      )
    : "";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/tontines" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {tf("title")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {step <= STEPS && (
          <>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">{t("step", { current: step, total: STEPS })}</p>
            <div className="mt-2 flex gap-1.5" aria-hidden>
              {Array.from({ length: STEPS }, (_, i) => (
                <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-accent" : "bg-muted")} />
              ))}
            </div>
          </>
        )}
      </div>

      {step === 1 && (
        <section className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold">{t("steps.basics")}</h2>
          <Field label={t("name")} htmlFor="name" hint={t("nameHint")} error={errorText("name")}>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputClass} />
          </Field>
          <Field label={t("amount")} htmlFor="amount" hint={t("amountHint")} error={errorText("amount")}>
            <div className="flex">
              <input
                id="amount"
                inputMode="numeric"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="10 000"
                className={cn(inputClass, "rounded-r-none tabular-nums")}
              />
              <span className="flex min-h-12 items-center rounded-r-lg border border-l-0 bg-muted px-3 font-medium">FCFA</span>
            </div>
          </Field>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold">{t("steps.rhythm")}</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">{t("frequency")}</legend>
            {FREQUENCIES.map((f) => (
              <Option key={f} selected={frequency === f} onSelect={() => setFrequency(f)} title={tf(`frequency.${f}`)} />
            ))}
          </fieldset>
          <Field label={t("startDate")} htmlFor="startDate" error={errorText("startDate")}>
            <input id="startDate" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label={t("memberLimit")} htmlFor="memberLimit" hint={t("memberLimitHint")} error={errorText("limit")}>
            <input
              id="memberLimit"
              type="number"
              inputMode="numeric"
              min={2}
              max={100}
              value={memberLimit}
              onChange={(e) => setMemberLimit(e.target.value)}
              className={inputClass}
            />
          </Field>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("steps.order")}</h2>
          {ORDERS.map((o) => (
            <Option key={o} selected={payoutOrder === o} onSelect={() => setPayoutOrder(o)} title={tf(`order.${o}`)} hint={t(`orderHint.${o}`)} />
          ))}
        </section>
      )}

      {step === 4 && (
        <section className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold">{t("steps.rules")}</h2>
          <Field label={t("graceDays")} htmlFor="graceDays" hint={t("graceDaysHint")}>
            <input
              id="graceDays"
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("penalty")} htmlFor="penalty" hint={t("penaltyHint")} error={errorText("penalty")}>
            <div className="flex">
              <input
                id="penalty"
                inputMode="numeric"
                value={penaltyText}
                onChange={(e) => setPenaltyText(e.target.value)}
                className={cn(inputClass, "rounded-r-none tabular-nums")}
              />
              <span className="flex min-h-12 items-center rounded-r-lg border border-l-0 bg-muted px-3 font-medium">FCFA</span>
            </div>
          </Field>
        </section>
      )}

      {step === STEPS + 1 && amount && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("summary.title")}</h2>
          <Card className="gap-3">
            <p className="text-xl font-bold">{name.trim()}</p>
            <p>
              {t("summary.contributions", {
                frequency: tf(`frequencyAdverb.${frequency}`),
                date: dateLabel,
                members,
                amount: money(amount),
              })}
            </p>
            <p>{t("summary.pot", { pot: money(amount * members), order: tf(`order.${payoutOrder}`).toLowerCase() })}</p>
            <p>
              {penalty
                ? t("summary.penalty", { days: Number(graceDays) || 0, penalty: money(penalty) })
                : t("summary.noPenalty", { days: Number(graceDays) || 0 })}
            </p>
            <p className="text-sm text-muted-foreground">{t("summary.afterStart")}</p>
          </Card>
          {error && (
            <p role="alert" className="font-medium text-destructive">
              {t(`errors.${error}`)}
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        {step > 1 ? (
          <Button type="button" variant="outline" size="lg" onClick={() => setStep((s) => s - 1)}>
            {t("back")}
          </Button>
        ) : (
          <span />
        )}
        {step <= STEPS ? (
          <Button type="button" size="lg" onClick={next}>
            {step === STEPS ? t("review") : t("next")}
          </Button>
        ) : (
          <Button type="button" size="lg" variant="accent" disabled={pending} onClick={save}>
            {t("save")}
          </Button>
        )}
      </div>
    </div>
  );
}
