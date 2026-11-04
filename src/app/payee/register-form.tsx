"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { compressImage } from "@/lib/compress-image";
import { WALLET_PROVIDERS, type WalletProvider } from "@/lib/linked-account";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { registerPayee, type RegisterError } from "./actions";

const CATEGORIES = ["school", "clinic", "pharmacy", "utility", "landlord"] as const;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

function DocumentPicker({ id, label, file, onChange }: { id: string; label: string; file: File | null; onChange: (f: File | null) => void }) {
  const t = useTranslations("payee.register");
  return (
    <Field label={label} htmlFor={id}>
      <label htmlFor={id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed bg-card px-4 font-medium hover:border-muted-foreground">
        <FileUp aria-hidden className="size-6 shrink-0" />
        <span className="truncate">{file ? t("fileReady", { name: file.name }) : t("chooseFile")}</span>
      </label>
      <input id={id} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </Field>
  );
}

export function RegisterForm({ userId }: { userId: string }) {
  const t = useTranslations("payee.register");
  const accounts = useTranslations("accounts");
  const [form, setForm] = useState({ name: "", rccm: "", category: "school", city: "Abidjan", address: "", contactPhone: "", payoutNumber: "" });
  const [payoutProvider, setPayoutProvider] = useState<WalletProvider>("bank");
  const [rccmDoc, setRccmDoc] = useState<File | null>(null);
  const [idDoc, setIdDoc] = useState<File | null>(null);
  const [error, setError] = useState<RegisterError | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const fieldError = (key: RegisterError) => (error === key ? t(`errors.${key}`) : null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!rccmDoc || !idDoc) return setError("documents");
    startTransition(async () => {
      try {
        const storage = createClient().storage.from("kyb-documents");
        const documents: { type: "rccm" | "manager_id"; path: string }[] = [];
        for (const [type, original] of [["rccm", rccmDoc], ["manager_id", idDoc]] as const) {
          const file = await compressImage(original);
          if (!EXTENSIONS[file.type] || file.size > 5 * 1024 * 1024) return setError("documents");
          const path = `${userId}/${type}-${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
          const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError) return setError("generic");
          documents.push({ type, path });
        }
        const result = await registerPayee({ ...form, payoutProvider, documents });
        if (result?.error) setError(result.error);
      } catch {
        setError("generic");
      }
    });
  }

  return (
    <Card>
      <CardTitle>{t("title")}</CardTitle>
      <CardDescription>{t("lead")}</CardDescription>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label={t("name")} htmlFor="bizName" error={fieldError("name")}>
          <input id="bizName" value={form.name} onChange={set("name")} className={inputClass} />
        </Field>
        <Field label={t("rccm")} htmlFor="rccm" hint={t("rccmHint")} error={fieldError("rccm")}>
          <input id="rccm" value={form.rccm} onChange={set("rccm")} autoCapitalize="characters" placeholder="CI-ABJ-2019-B-12345" className={inputClass} />
        </Field>
        <Field label={t("category")} htmlFor="category">
          <select id="category" value={form.category} onChange={set("category")} className={inputClass}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("city")} htmlFor="bizCity" error={fieldError("city")}>
            <input id="bizCity" value={form.city} onChange={set("city")} className={inputClass} />
          </Field>
          <Field label={t("address")} htmlFor="bizAddress">
            <input id="bizAddress" value={form.address} onChange={set("address")} placeholder="Abobo, près du marché" className={inputClass} />
          </Field>
        </div>
        <Field label={t("contact")} htmlFor="contact" hint={t("contactHint")} error={fieldError("contact")}>
          <input id="contact" type="tel" inputMode="tel" value={form.contactPhone} onChange={set("contactPhone")} placeholder="07 00 00 00 01" className={inputClass} />
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">{t("payout")}</legend>
          <p className="text-sm text-muted-foreground">{t("payoutHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            {WALLET_PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={payoutProvider === p}
                onClick={() => setPayoutProvider(p)}
                className={cn("min-h-12 rounded-lg border-2 px-3 text-sm font-semibold", payoutProvider === p ? "border-primary" : "border-border text-muted-foreground", p === "bank" && "col-span-2")}
              >
                {accounts(`providers.${p}`)}
              </button>
            ))}
          </div>
          <Field
            label={payoutProvider === "bank" ? accounts("iban") : accounts("number")}
            htmlFor="payoutNumber"
            error={error && ["invalidNumber", "wrongNetwork", "invalidIban", "verificationFailed"].includes(error) ? accounts(`errors.${error}` as "errors.invalidIban") : null}
          >
            <input id="payoutNumber" value={form.payoutNumber} onChange={set("payoutNumber")} autoCapitalize="characters" className={cn(inputClass, "tabular-nums")} />
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">{t("documents")}</legend>
          <DocumentPicker id="rccmDoc" label={t("rccmDoc")} file={rccmDoc} onChange={setRccmDoc} />
          <DocumentPicker id="idDoc" label={t("idDoc")} file={idDoc} onChange={setIdDoc} />
          {error === "documents" && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {t("errors.documents")}
            </p>
          )}
        </fieldset>

        {(error === "generic" || error === "alreadyRegistered" || error === "category") && (
          <p role="alert" className="font-medium text-destructive">
            {t(`errors.${error}`)}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("sending") : t("submit")}
        </Button>
      </form>
    </Card>
  );
}
