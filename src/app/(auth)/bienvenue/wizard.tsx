"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { setLocale } from "@/i18n/actions";
import { cn } from "@/lib/utils";
import { completeOnboarding, type OnboardingError } from "./actions";

const DIASPORA_COUNTRIES = ["FR", "US", "CA", "SN", "ML", "BF", "NE", "TG", "BJ", "GW"] as const;
const TOTAL = 3;

interface Props {
  locale: string;
  initial: { fullName: string; userType: "resident" | "diaspora" | null; city: string; countryCode: string };
}

function Choice({
  selected,
  onSelect,
  title,
  hint,
  icon,
  lang,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  lang?: string;
}) {
  return (
    <button
      type="button"
      lang={lang}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-16 w-full items-center gap-4 rounded-xl border-2 bg-card p-4 text-left transition-colors",
        selected ? "border-primary" : "border-border hover:border-muted-foreground",
      )}
    >
      {icon}
      <span className="flex flex-col">
        <span className="text-lg font-semibold">{title}</span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

export function OnboardingWizard({ locale, initial }: Props) {
  const t = useTranslations("onboarding");
  const countries = useTranslations("auth.countries");
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [userType, setUserType] = useState(initial.userType);
  const [fullName, setFullName] = useState(initial.fullName);
  const [city, setCity] = useState(initial.city);
  const [countryCode, setCountryCode] = useState(initial.countryCode);
  const [error, setError] = useState<OnboardingError | null>(null);
  const [pending, startTransition] = useTransition();

  function chooseLanguage(next: "fr" | "en") {
    startTransition(async () => {
      if (next !== locale) {
        await setLocale(next);
        router.refresh();
      }
    });
  }

  function finish(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding({ locale, userType: userType ?? "", fullName, city, countryCode });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">{t("step", { current: step, total: TOTAL })}</p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL }, (_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-accent" : "bg-muted")} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold">{t("language.title")}</h1>
          <Choice lang="fr" title="Français" selected={locale === "fr"} onSelect={() => chooseLanguage("fr")} />
          <Choice lang="en" title="English" selected={locale === "en"} onSelect={() => chooseLanguage("en")} />
          <Button size="lg" disabled={pending} onClick={() => setStep(2)}>
            {t("next")}
          </Button>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold">{t("type.title")}</h1>
          <Choice
            title={t("type.resident")}
            hint={t("type.residentHint")}
            icon={<Globe aria-hidden className="size-7 shrink-0" />}
            selected={userType === "resident"}
            onSelect={() => setUserType("resident")}
          />
          <Choice
            title={t("type.diaspora")}
            hint={t("type.diasporaHint")}
            icon={<Plane aria-hidden className="size-7 shrink-0" />}
            selected={userType === "diaspora"}
            onSelect={() => setUserType("diaspora")}
          />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" onClick={() => setStep(1)}>
              {t("back")}
            </Button>
            <Button size="lg" disabled={!userType} onClick={() => setStep(3)}>
              {t("next")}
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <form onSubmit={finish} noValidate className="flex flex-col gap-5">
          <h1 className="text-3xl font-bold">{t("details.title")}</h1>
          <Field label={t("details.name")} htmlFor="fullName" error={error === "name" ? t("errors.name") : null}>
            <input
              id="fullName"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-invalid={error === "name"}
              className={inputClass}
            />
          </Field>
          {userType === "diaspora" && (
            <Field label={t("details.country")} htmlFor="country">
              <select id="country" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className={inputClass}>
                {DIASPORA_COUNTRIES.map((code) => (
                  <option key={code} value={code}>
                    {countries(code)}
                  </option>
                ))}
                <option value="XX">{t("details.otherCountry")}</option>
              </select>
            </Field>
          )}
          <Field label={t("details.city")} htmlFor="city" error={error === "city" ? t("errors.city") : null}>
            <input
              id="city"
              autoComplete="address-level2"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={userType === "resident" ? "Abidjan, Yopougon" : "Paris"}
              aria-invalid={error === "city"}
              className={inputClass}
            />
          </Field>
          {(error === "generic" || error === "type") && (
            <p role="alert" className="font-medium text-destructive">
              {t(`errors.${error}`)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(2)}>
              {t("back")}
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {t("finish")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
