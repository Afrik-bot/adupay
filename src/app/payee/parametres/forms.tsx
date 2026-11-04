"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { WALLET_PROVIDERS, type WalletProvider } from "@/lib/linked-account";
import { cn } from "@/lib/utils";
import { changePayoutAccount, updateContact } from "../actions";

export function ContactForm({ phone, address }: { phone: string; address: string }) {
  const t = useTranslations("payee.settings");
  const register = useTranslations("payee.register");
  const [values, setValues] = useState({ phone, address });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardTitle>{t("contactTitle")}</CardTitle>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await updateContact(values.phone, values.address);
            setMessage("ok" in result ? { ok: true, text: t("saved") } : { ok: false, text: register(`errors.${result.error === "contact" ? "contact" : "generic"}`) });
          });
        }}
      >
        <Field label={register("contact")} htmlFor="setPhone">
          <input id="setPhone" type="tel" value={values.phone} onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))} className={inputClass} />
        </Field>
        <Field label={register("address")} htmlFor="setAddress">
          <input id="setAddress" value={values.address} onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))} className={inputClass} />
        </Field>
        {message && (
          <p role={message.ok ? "status" : "alert"} className={cn("text-sm font-medium", message.ok ? "text-success" : "text-destructive")}>
            {message.text}
          </p>
        )}
        <Button type="submit" variant="outline" disabled={pending}>
          {t("save")}
        </Button>
      </form>
    </Card>
  );
}

export function PayoutForm({ current }: { current: string }) {
  const t = useTranslations("payee.settings");
  const accounts = useTranslations("accounts");
  const [provider, setProvider] = useState<WalletProvider>("bank");
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardTitle>{t("payoutTitle")}</CardTitle>
      <CardDescription>{t("payoutCurrent", { account: current })}</CardDescription>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await changePayoutAccount(provider, number);
            if ("ok" in result) {
              setNumber("");
              setMessage({ ok: true, text: t("payoutChanged") });
            } else {
              setMessage({ ok: false, text: result.error === "generic" ? t("error") : accounts(`errors.${result.error}`) });
            }
          });
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          {WALLET_PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={provider === p}
              onClick={() => setProvider(p)}
              className={cn("min-h-12 rounded-lg border-2 px-3 text-sm font-semibold", provider === p ? "border-primary" : "border-border text-muted-foreground", p === "bank" && "col-span-2")}
            >
              {accounts(`providers.${p}`)}
            </button>
          ))}
        </div>
        <Field label={provider === "bank" ? accounts("iban") : accounts("number")} htmlFor="newPayout">
          <input id="newPayout" value={number} onChange={(e) => setNumber(e.target.value)} autoCapitalize="characters" className={cn(inputClass, "tabular-nums")} />
        </Field>
        <p className="text-xs text-muted-foreground">{t("payoutAudit")}</p>
        {message && (
          <p role={message.ok ? "status" : "alert"} className={cn("text-sm font-medium", message.ok ? "text-success" : "text-destructive")}>
            {message.text}
          </p>
        )}
        <Button type="submit" disabled={pending || !number.trim()}>
          {t("payoutSubmit")}
        </Button>
      </form>
    </Card>
  );
}
