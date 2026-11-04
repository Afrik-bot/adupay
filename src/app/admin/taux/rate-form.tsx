"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { setFxRate } from "../actions";

export function RateForm({ currency, rate, feeBps, marginBps }: { currency: "EUR" | "USD" | "CAD"; rate: number; feeBps: number; marginBps: number }) {
  const t = useTranslations("admin.fx");
  const [values, setValues] = useState({ rate: String(rate), fee: String(feeBps / 100), margin: String(marginBps / 100) });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const num = (s: string) => Number(s.replace(",", "."));

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await setFxRate(currency, num(values.rate), Math.round(num(values.fee) * 100), Math.round(num(values.margin) * 100));
          setMessage("error" in result ? result.error : t("saved"));
        });
      }}
    >
      <Field label={t("rate", { currency })} htmlFor={`rate-${currency}`}>
        <input id={`rate-${currency}`} inputMode="decimal" value={values.rate} onChange={(e) => setValues((v) => ({ ...v, rate: e.target.value }))} className={inputClass} />
      </Field>
      <Field label={t("fee")} htmlFor={`fee-${currency}`}>
        <input id={`fee-${currency}`} inputMode="decimal" value={values.fee} onChange={(e) => setValues((v) => ({ ...v, fee: e.target.value }))} className={inputClass} />
      </Field>
      <Field label={t("margin")} htmlFor={`margin-${currency}`}>
        <input id={`margin-${currency}`} inputMode="decimal" value={values.margin} onChange={(e) => setValues((v) => ({ ...v, margin: e.target.value }))} className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
      {message && (
        <p role="status" className="text-sm sm:col-span-4">
          {message}
        </p>
      )}
    </form>
  );
}
