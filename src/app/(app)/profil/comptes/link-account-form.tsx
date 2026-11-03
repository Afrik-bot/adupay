"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { WALLET_PROVIDERS, type WalletProvider } from "@/lib/linked-account";
import { cn } from "@/lib/utils";
import { linkAccount, type LinkAccountError } from "./actions";

export function LinkAccountForm() {
  const t = useTranslations("accounts");
  const [provider, setProvider] = useState<WalletProvider>("orange_money");
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<LinkAccountError | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const isBank = provider === "bank";

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await linkAccount({ provider, number, label });
      if ("error" in result) return setError(result.error);
      setNumber("");
      setLabel("");
      setDone(true);
    });
  }

  return (
    <Card>
      <CardTitle>{t("add")}</CardTitle>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("provider")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {WALLET_PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={provider === p}
                onClick={() => {
                  setProvider(p);
                  setError(null);
                }}
                className={cn(
                  "min-h-12 rounded-lg border-2 px-3 text-sm font-semibold",
                  provider === p ? "border-primary bg-card" : "border-border text-muted-foreground",
                  p === "bank" && "col-span-2",
                )}
              >
                {t(`providers.${p}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <Field
          label={isBank ? t("iban") : t("number")}
          htmlFor="accountNumber"
          hint={isBank ? t("ibanHint") : t(`numberHint.${provider}`)}
          error={error && error !== "label" && error !== "generic" ? t(`errors.${error}`) : null}
        >
          <input
            id="accountNumber"
            inputMode={isBank ? "text" : "tel"}
            autoComplete="off"
            autoCapitalize={isBank ? "characters" : "off"}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            aria-invalid={Boolean(error) && error !== "label"}
            className={cn(inputClass, "tabular-nums")}
          />
        </Field>
        <Field label={t("label")} htmlFor="accountLabel" hint={t("labelHint")} error={error === "label" ? t("errors.label") : null}>
          <input
            id="accountLabel"
            maxLength={40}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputClass}
          />
        </Field>
        {error === "generic" && (
          <p role="alert" className="font-medium text-destructive">
            {t("errors.generic")}
          </p>
        )}
        {done && (
          <p role="status" className="font-medium text-success">
            {t("linked")}
          </p>
        )}
        <Button type="submit" disabled={pending || !number.trim()}>
          <Plus aria-hidden />
          {pending ? t("verifying") : t("submit")}
        </Button>
      </form>
    </Card>
  );
}
