"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

type Enrolment = { factorId: string; qr: string; secret: string };

/** Sets up an authenticator app (first visit) or asks for its 6-digit code. */
export function MfaForm({ factorId }: { factorId: string | null }) {
  const t = useTranslations("auth.mfa");
  const router = useRouter();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<"invalidCode" | "generic" | null>(null);
  const [busy, setBusy] = useState(false);
  const activeFactor = factorId ?? enrolment?.factorId ?? null;

  async function startEnrolment() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // A set-up abandoned earlier leaves an unverified factor: remove it first.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "AduPay staff" });
    setBusy(false);
    if (error || !data) return setError("generic");
    setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!activeFactor) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: activeFactor, code: code.trim() });
    setBusy(false);
    if (error) return setError(error.code === "mfa_verification_failed" || error.status === 422 ? "invalidCode" : "generic");
    router.replace("/admin");
    router.refresh();
  }

  if (!activeFactor) {
    return (
      <div className="flex flex-col gap-4">
        <p>{t("setupLead")}</p>
        <Button onClick={startEnrolment} disabled={busy} className="min-h-12">
          {t("setup")}
        </Button>
        {error && <p className="text-sm font-semibold text-destructive">{t(`errors.${error}`)}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      {enrolment && (
        <div className="flex flex-col gap-3">
          <p>{t("scan")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI from Supabase */}
          <img src={enrolment.qr} alt={t("qrAlt")} width={200} height={200} className="rounded-lg bg-white p-2" />
          <p className="text-sm text-muted-foreground">{t("manual")}</p>
          <code className="break-all rounded-lg bg-muted p-3 font-mono text-sm" data-testid="mfa-secret">
            {enrolment.secret}
          </code>
        </div>
      )}
      <Field label={t("code")} htmlFor="mfaCode" error={error ? t(`errors.${error}`) : null}>
        <input
          id="mfaCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-invalid={Boolean(error)}
          className={inputClass}
        />
      </Field>
      <Button type="submit" disabled={busy || code.length !== 6} className="min-h-12">
        {t("verify")}
      </Button>
    </form>
  );
}
