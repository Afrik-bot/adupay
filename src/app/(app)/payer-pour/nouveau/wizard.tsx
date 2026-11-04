"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Building2, CreditCard, GraduationCap, HeartPulse, Home, Lock, Receipt, Search, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { formatCardNumber, SANDBOX_TEST_CARDS, tokenizeCard, type CardError } from "@/lib/card";
import { formatMoney, parseMoney, type Locale } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getQuote, payDirected, searchPayees, type PayeeResult, type Quote } from "../actions";
import type { StartError } from "@/server/directed-payments";

type Purpose = "school" | "health" | "bills" | "rent" | "tontine";
type SourceCurrency = "EUR" | "USD" | "CAD";
interface Sponsorship {
  group_id: string;
  group_name: string;
  member_name: string;
  contribution_amount: number;
  paid: boolean;
}

const PURPOSES: { key: Purpose; icon: typeof GraduationCap }[] = [
  { key: "school", icon: GraduationCap },
  { key: "health", icon: HeartPulse },
  { key: "bills", icon: Receipt },
  { key: "rent", icon: Home },
  { key: "tontine", icon: Users },
];
const STEPS = 5;

function Choice({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl border-2 bg-card px-4 py-3 text-left",
        selected ? "border-primary" : "border-border hover:border-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function PayForWizard({
  locale,
  defaultCurrency,
  sponsorships,
  preselectGroupId,
}: {
  locale: string;
  defaultCurrency: SourceCurrency;
  sponsorships: Sponsorship[];
  preselectGroupId: string | null;
}) {
  const t = useTranslations("payFor");
  const credit = useTranslations("credit");
  const preselected = sponsorships.find((s) => s.group_id === preselectGroupId) ?? null;
  const [step, setStep] = useState(preselected ? 3 : 1);
  const [purpose, setPurpose] = useState<Purpose | null>(preselected ? "tontine" : null);
  const [city, setCity] = useState("Abidjan");
  const [query, setQuery] = useState("");
  const [payees, setPayees] = useState<PayeeResult[] | null>(null);
  const [payee, setPayee] = useState<PayeeResult | null>(null);
  const [sponsorship, setSponsorship] = useState<Sponsorship | null>(preselected);
  const [beneficiary, setBeneficiary] = useState(preselected?.member_name ?? "");
  const [reference, setReference] = useState("");
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState<SourceCurrency>(defaultCurrency);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // One key per attempt to pay: a double tap or a retry never charges twice.
  const [requestKey] = useState(() => crypto.randomUUID());

  const money = (v: number, c: "XOF" | SourceCurrency = "XOF") => formatMoney(v, c, locale as Locale);
  const amountXof = purpose === "tontine" ? (sponsorship?.contribution_amount ?? null) : parseMoney(amountText, "XOF");

  useEffect(() => {
    if (step !== 2 || purpose === "tontine" || !purpose) return;
    const timer = setTimeout(() => {
      startTransition(async () => setPayees(await searchPayees(purpose, city, query)));
    }, 250);
    return () => clearTimeout(timer);
  }, [step, purpose, city, query]);

  useEffect(() => {
    if (step !== 4 || !amountXof) return;
    let cancelled = false;
    getQuote(amountXof, currency).then((q) => !cancelled && setQuote(q));
    return () => {
      cancelled = true;
    };
  }, [step, amountXof, currency]);

  const delivery = useMemo(() => {
    if (purpose === "tontine") return t("delivery.tontine");
    return payee?.payout_provider === "bank" ? t("delivery.bank") : t("delivery.wallet");
  }, [purpose, payee, t]);

  function next() {
    setError(null);
    if (step === 1 && !purpose) return setError(t("errors.purpose"));
    if (step === 2 && purpose !== "tontine" && !payee) return setError(t("errors.payee"));
    if (step === 2 && purpose === "tontine" && !sponsorship) return setError(t("errors.payee"));
    if (step === 3) {
      if (beneficiary.trim().length < 2) return setError(t("errors.beneficiary"));
      if (!amountXof || amountXof < 1000 || amountXof > 2_000_000) return setError(t("errors.amount"));
    }
    if (step === 4 && !quote) return;
    setStep((s) => s + 1);
  }

  function pay(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const card = tokenizeCard({ number: cardNumber, expiry, cvc });
    if ("error" in card) return setError(t(`cardErrors.${card.error satisfies CardError}`));
    startTransition(async () => {
      const result = await payDirected({
        requestKey,
        purpose: purpose!,
        payeeId: payee?.id ?? null,
        groupId: sponsorship?.group_id ?? null,
        beneficiaryName: beneficiary,
        reference,
        amountXof: amountXof!,
        currency,
        card,
        recurring,
      });
      if (result?.error) setError(t(`startErrors.${result.error satisfies StartError | "card" | "tooMany"}`));
    });
  }

  const payeeLabel = purpose === "tontine" ? sponsorship?.group_name : payee?.name;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/payer-pour" className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {t("title")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t("new")}</h1>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">{t("step", { current: step, total: STEPS })}</p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-accent" : "bg-muted")} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("steps.purpose")}</h2>
          {PURPOSES.map(({ key, icon: Icon }) => (
            <Choice
              key={key}
              selected={purpose === key}
              onSelect={() => {
                setPurpose(key);
                setPayee(null);
                setSponsorship(null);
                setPayees(null);
              }}
            >
              <Icon aria-hidden className="size-6 shrink-0" />
              <span>
                <span className="block font-semibold">{t(`purposes.${key}`)}</span>
                <span className="block text-sm text-muted-foreground">{t(`purposeHints.${key}`)}</span>
              </span>
            </Choice>
          ))}
          {/* Data & crédit: the AduPay Connect top-up flow, for a relative. */}
          <Link
            href="/credit?pour=proche"
            className="flex min-h-14 w-full items-center gap-3 rounded-xl border-2 border-border bg-card px-4 py-3 text-left hover:border-muted-foreground"
          >
            <Smartphone aria-hidden className="size-6 shrink-0" />
            <span>
              <span className="block font-semibold">{credit("payFor")}</span>
              <span className="block text-sm text-muted-foreground">{credit("payForHint")}</span>
            </span>
          </Link>
        </section>
      )}

      {step === 2 && purpose !== "tontine" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("steps.payee")}</h2>
          <div className="grid grid-cols-[1fr_1.4fr] gap-2">
            <Field label={t("city")} htmlFor="city">
              <input id="city" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
            </Field>
            <Field label={t("search")} htmlFor="search">
              <div className="relative">
                <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} className={cn(inputClass, "pl-9")} />
              </div>
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">{t("verifiedOnly")}</p>
          <ul className="flex flex-col gap-2" aria-busy={pending}>
            {payees?.map((p) => (
              <li key={p.id}>
                <Choice selected={payee?.id === p.id} onSelect={() => setPayee(p)}>
                  <Building2 aria-hidden className="size-6 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {t(`categories.${p.category}` as "categories.school")} · {[p.address, p.city].filter(Boolean).join(", ")}
                    </span>
                  </span>
                </Choice>
              </li>
            ))}
            {payees && payees.length === 0 && <li className="rounded-xl border border-dashed p-4 text-muted-foreground">{t("noPayees")}</li>}
          </ul>
        </section>
      )}

      {step === 2 && purpose === "tontine" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("steps.tontine")}</h2>
          {sponsorships.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{t("noSponsorships")}</p>
          ) : (
            sponsorships.map((s) => (
              <Choice
                key={s.group_id}
                selected={sponsorship?.group_id === s.group_id}
                onSelect={() => {
                  setSponsorship(s);
                  setBeneficiary(s.member_name);
                }}
              >
                <Users aria-hidden className="size-6 shrink-0" />
                <span>
                  <span className="block font-semibold">{s.group_name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {t("shareOf", { name: s.member_name, amount: money(s.contribution_amount) })}
                    {s.paid ? ` · ${t("alreadyPaid")}` : ""}
                  </span>
                </span>
              </Choice>
            ))
          )}
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold">{t("steps.details")}</h2>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">{payeeLabel}</p>
          <Field label={t("beneficiary")} htmlFor="beneficiary" hint={t("beneficiaryHint")}>
            <input id="beneficiary" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} maxLength={80} className={inputClass} />
          </Field>
          {purpose !== "tontine" && (
            <Field label={t(`referenceLabel.${purpose}` as "referenceLabel.school")} htmlFor="reference" hint={t(`referenceHint.${purpose}` as "referenceHint.school")}>
              <input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} className={inputClass} />
            </Field>
          )}
          {purpose === "tontine" ? (
            <p>{t("tontineAmount", { amount: money(amountXof ?? 0) })}</p>
          ) : (
            <Field label={t("amount")} htmlFor="amount" hint={t("amountHint")}>
              <div className="flex">
                <input
                  id="amount"
                  inputMode="numeric"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  placeholder="150 000"
                  className={cn(inputClass, "rounded-r-none tabular-nums")}
                />
                <span className="flex min-h-12 items-center rounded-r-lg border border-l-0 bg-muted px-3 font-medium">FCFA</span>
              </div>
            </Field>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("steps.review")}</h2>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t("payIn")}</legend>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {(["EUR", "USD", "CAD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={currency === c}
                  onClick={() => {
                    setQuote(null);
                    setCurrency(c);
                  }}
                  className={cn("min-h-12 rounded-md font-semibold", currency === c ? "bg-card shadow-sm" : "text-muted-foreground")}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
          <Card className="gap-2" aria-busy={!quote}>
            <p className="text-sm text-muted-foreground">{t("to", { name: payeeLabel ?? "" })}</p>
            <p className="text-2xl font-extrabold tabular-nums">{money(amountXof ?? 0)}</p>
            {quote ? (
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">{t("rate")}</dt>
                <dd className="text-right tabular-nums">
                  1 {currency} = {quote.customer_rate.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 3 })} FCFA
                </dd>
                <dt className="text-muted-foreground">{t("converted")}</dt>
                <dd className="text-right tabular-nums">{money(quote.base_amount, currency)}</dd>
                <dt className="text-muted-foreground">{t("fee", { pct: (quote.fee_bps / 100).toLocaleString(locale === "fr" ? "fr-FR" : "en-US") })}</dt>
                <dd className="text-right tabular-nums">{money(quote.fee_amount, currency)}</dd>
                <dt className="font-semibold">{t("total")}</dt>
                <dd className="text-right text-lg font-bold tabular-nums">{money(quote.total_amount, currency)}</dd>
                <dt className="text-muted-foreground">{t("allIn")}</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {quote.all_in_pct.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 })}
                  {locale === "fr" ? " %" : "%"}
                </dd>
                <dt className="text-muted-foreground">{t("deliveryLabel")}</dt>
                <dd className="text-right">{delivery}</dd>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{t("quoting")}</p>
            )}
          </Card>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="size-5 accent-[var(--primary)]" />
            <span>
              <span className="block font-medium">{t("recurring")}</span>
              <span className="block text-sm text-muted-foreground">{t("recurringHint")}</span>
            </span>
          </label>
        </section>
      )}

      {step === 5 && quote && (
        <form onSubmit={pay} noValidate className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("steps.pay")}</h2>
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            <Lock aria-hidden className="size-4 shrink-0" />
            {t("sandboxCard", { ok: SANDBOX_TEST_CARDS.success, declined: SANDBOX_TEST_CARDS.declined })}
          </p>
          <Field label={t("cardNumber")} htmlFor="cardNumber">
            <div className="relative">
              <CreditCard aria-hidden className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
              <input
                id="cardNumber"
                inputMode="numeric"
                autoComplete="cc-number"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="4242 4242 4242 4242"
                className={cn(inputClass, "pl-10 tabular-nums")}
              />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("expiry")} htmlFor="expiry">
              <input
                id="expiry"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/AA"
                value={expiry}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                }}
                className={cn(inputClass, "tabular-nums")}
              />
            </Field>
            <Field label={t("cvc")} htmlFor="cvc">
              <input
                id="cvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                maxLength={4}
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, ""))}
                className={cn(inputClass, "tabular-nums")}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">{t("cardPrivacy")}</p>
          {error && (
            <p role="alert" className="font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" variant="accent" disabled={pending}>
            {pending ? t("paying") : t("payTotal", { total: money(quote.total_amount, currency) })}
          </Button>
        </form>
      )}

      {step < STEPS && (
        <>
          {error && (
            <p role="alert" className="font-medium text-destructive">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {step > 1 ? (
              <Button type="button" variant="outline" size="lg" onClick={() => setStep((s) => s - 1)}>
                {t("back")}
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" size="lg" onClick={next} disabled={step === 4 && !quote}>
              {step === 4 ? t("toPayment") : t("next")}
            </Button>
          </div>
        </>
      )}
      {step === STEPS && (
        <Button type="button" variant="outline" size="lg" onClick={() => setStep(4)}>
          {t("back")}
        </Button>
      )}
    </div>
  );
}
