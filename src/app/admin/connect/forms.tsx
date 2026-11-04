"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { setAirtimeProduct, setRewardRule, setRewardSettings } from "../actions";

type Trigger = "on_time_contribution" | "clean_cycle" | "manager_member_on_time";
const toInt = (s: string) => Number(s.replace(/[\s  ]/g, ""));

function useSave() {
  const t = useTranslations("connectAdmin");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { error: string }>) =>
    startTransition(async () => {
      const result = await fn();
      setMessage("error" in result ? result.error : t("saved"));
    });
  return { message, pending, run, t };
}

export function RuleForm({ trigger, productId, active, options }: { trigger: Trigger; productId: string; active: boolean; options: { id: string; label: string }[] }) {
  const { message, pending, run, t } = useSave();
  const [product, setProduct] = useState(productId);
  const [on, setOn] = useState(active);
  const selectId = useId();
  const activeId = useId();
  return (
    <div className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0">
      <p className="font-semibold">{t(`triggers.${trigger}`)}</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <label htmlFor={selectId} className="sr-only">
          {t("product")}
        </label>
        <select id={selectId} value={product} onChange={(e) => setProduct(e.target.value)} className={inputClass}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <label htmlFor={activeId} className="flex min-h-12 items-center gap-2">
          <input id={activeId} type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-5 accent-primary" />
          {t("active")}
        </label>
        <Button size="sm" disabled={pending} onClick={() => run(() => setRewardRule(trigger, product, on))}>
          {t("save")}
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}

export function BudgetForm({ cap, budget }: { cap: number; budget: number }) {
  const { message, pending, run, t } = useSave();
  const [values, setValues] = useState({ cap: String(cap), budget: String(budget) });
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setRewardSettings(toInt(values.cap), toInt(values.budget)));
      }}
    >
      <Field label={t("cap")} htmlFor="rewardCap">
        <input id="rewardCap" inputMode="numeric" value={values.cap} onChange={(e) => setValues((v) => ({ ...v, cap: e.target.value }))} className={inputClass} />
      </Field>
      <Field label={t("monthBudget")} htmlFor="rewardBudget">
        <input id="rewardBudget" inputMode="numeric" value={values.budget} onChange={(e) => setValues((v) => ({ ...v, budget: e.target.value }))} className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
      {message && (
        <p role="status" className="text-sm sm:col-span-3">
          {message}
        </p>
      )}
    </form>
  );
}

export function ProductRow({ id, label, price, active }: { id: string; label: string; price: number; active: boolean }) {
  const { message, pending, run, t } = useSave();
  const [value, setValue] = useState(String(price));
  const [on, setOn] = useState(active);
  const priceId = useId();
  const activeId = useId();
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-center">
        <span className="font-medium">{label}</span>
        <label htmlFor={priceId} className="sr-only">
          {t("price")}
        </label>
        <input id={priceId} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
        <label htmlFor={activeId} className="flex min-h-12 items-center gap-2">
          <input id={activeId} type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-5 accent-primary" />
          {t("active")}
        </label>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setAirtimeProduct(id, toInt(value), on))}>
          {t("save")}
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </li>
  );
}
