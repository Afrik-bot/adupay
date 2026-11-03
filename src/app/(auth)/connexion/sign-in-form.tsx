"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PHONE_COUNTRY, formatE164, PHONE_COUNTRIES, phoneCountry, toE164 } from "@/lib/phone";

const RESEND_SECONDS = 30;

type ErrorKey = "invalidPhone" | "invalidCode" | "rateLimited" | "providerDisabled" | "generic";

function errorKey(error: { code?: string; status?: number; message?: string }): ErrorKey {
  if (error.status === 429 || error.code === "over_sms_send_rate_limit" || error.code === "over_request_rate_limit") {
    return "rateLimited";
  }
  if (error.code === "phone_provider_disabled" || error.code === "sms_send_failed") return "providerDisabled";
  if (error.code === "otp_expired" || error.code === "invalid_credentials") return "invalidCode";
  if (error.code === "validation_failed") return "invalidPhone";
  return "generic";
}

export function SignInForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState<string | null>(null); // E.164 once the code is sent
  const [code, setCode] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(e164: string) {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) return setError(errorKey(error));
    setPhone(e164);
    setCooldown(RESEND_SECONDS);
  }

  async function onPhoneSubmit(event: React.FormEvent) {
    event.preventDefault();
    const e164 = toE164(number, country);
    if (!e164) return setError("invalidPhone");
    await sendCode(e164);
  }

  async function onCodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!phone || !/^\d{6}$/.test(code)) return setError("invalidCode");
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ phone, token: code, type: "sms" });
    if (error) {
      setBusy(false);
      return setError(errorKey(error));
    }
    // The app layout sends first-time users on to onboarding. Only same-site
    // paths are followed, so the link cannot send anyone elsewhere.
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(next && /^\/(?!\/)[a-z0-9/_-]*$/i.test(next) ? next : "/accueil");
    router.refresh();
  }

  if (!phone) {
    const selected = phoneCountry(country);
    return (
      <form onSubmit={onPhoneSubmit} noValidate className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("lead")}</p>
        </div>
        <Field label={t("country")} htmlFor="country">
          <select id="country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass}>
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.iso} value={c.iso}>
                {t(`countries.${c.iso}`)} (+{c.dial})
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={t("phone")}
          htmlFor="phone"
          hint={t("phoneHint", { example: selected.example })}
          error={error ? t(`errors.${error}`) : null}
        >
          <div className="flex">
            <span className="flex min-h-12 items-center rounded-l-lg border border-r-0 bg-muted px-3 font-medium tabular-nums">
              +{selected.dial}
            </span>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={selected.example}
              aria-invalid={error === "invalidPhone"}
              aria-describedby={error ? "phone-error" : "phone-hint"}
              className={`${inputClass} rounded-l-none tabular-nums`}
            />
          </div>
        </Field>
        <Button type="submit" size="lg" disabled={busy || !number.trim()}>
          {t("sendCode")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onCodeSubmit} noValidate className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">{t("codeTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("codeLead", { phone: formatE164(phone) })}</p>
      </div>
      <Field label={t("code")} htmlFor="code" error={error ? t(`errors.${error}`) : null}>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-invalid={error === "invalidCode"}
          aria-describedby={error ? "code-error" : undefined}
          className={`${inputClass} text-center text-2xl tracking-[0.5em] tabular-nums`}
          autoFocus
        />
      </Field>
      <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
        {t("verify")}
      </Button>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" disabled={busy || cooldown > 0} onClick={() => sendCode(phone)}>
          {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setPhone(null);
            setCode("");
            setError(null);
          }}
        >
          {t("changeNumber")}
        </Button>
      </div>
    </form>
  );
}
