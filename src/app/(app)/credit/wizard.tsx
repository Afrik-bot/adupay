"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard, Lock, Smartphone, User, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { formatMsisdn, formatVolume, OPERATORS, operatorFor, type Operator } from "@/lib/airtime";
import { formatCardNumber, SANDBOX_TEST_CARDS, tokenizeCard } from "@/lib/card";
import { formatMoney, type Locale } from "@/lib/money";
import { toE164 } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { getQuote } from "../payer-pour/actions";
import { buyTopup } from "./actions";

export interface WizardProduct {
  id: string;
  operator: Operator;
  type: "airtime" | "data";
  label: string;
  data_mb: number | null;
  price_xof: number;
  validity_days: number | null;
}

interface Props {
  products: WizardProduct[];
  saved: { id: string; msisdn: string; name: string; operator: Operator }[];
  myNumber: string | null;
  balance: number;
  mobileMoney: string | null;
  allowCard: boolean;
  initial: { who: "me" | "other"; number?: string; name?: string; operator?: Operator; productId?: string };
}

type PayWith = "balance" | "mobile_money" | "card";
const STEPS = 3;

function Choice({ selected, onSelect, children, className }: { selected: boolean; onSelect: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border-2 bg-card px-4 py-3 text-left", selected ? "border-primary" : "border-border hover:border-muted-foreground", className)}
    >
      {children}
    </button>
  );
}

export function TopupWizard({ products, saved, myNumber, balance, mobileMoney, allowCard, initial }: Props) {
  const t = useTranslations("credit");
  const locale = useLocale() as Locale;
  const money = (v: number, c: "XOF" | "EUR" | "USD" | "CAD" = "XOF") => formatMoney(v, c, locale);
  const [step, setStep] = useState(initial.productId ? 3 : 1);
  const [who, setWho] = useState<"me" | "other">(initial.who);
  const [number, setNumber] = useState(initial.number ? formatMsisdn(initial.number).replace("+225 ", "") : "");
  const [name, setName] = useState(initial.name ?? "");
  const [operator, setOperator] = useState<Operator | null>(initial.operator ?? (myNumber && initial.who === "me" ? operatorFor(myNumber) : null));
  const [kind, setKind] = useState<"airtime" | "data">(products.find((p) => p.id === initial.productId)?.type ?? "data");
  const [productId, setProductId] = useState<string | null>(initial.productId ?? null);
  const [payWith, setPayWith] = useState<PayWith>(() => (allowCard ? "card" : mobileMoney ? "mobile_money" : "balance"));
  const [currency, setCurrency] = useState<"EUR" | "USD" | "CAD">("EUR");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [save, setSave] = useState(false);
  // What the card is charged: the FCFA price at the FX table's customer rate, no fee.
  const [charged, setCharged] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [requestKey] = useState(() => crypto.randomUUID());
  const saveId = useId();

  const msisdn = who === "me" ? myNumber : (toE164(number, "CI") ?? "").replace(/\D/g, "");
  const validNumber = Boolean(msisdn && /^225\d{10}$/.test(msisdn));
  const product = products.find((p) => p.id === productId) ?? null;
  const choices = useMemo(() => products.filter((p) => p.operator === operator && p.type === kind), [products, operator, kind]);
  const isSaved = saved.some((s) => s.msisdn === msisdn);
  const beneficiary = who === "me" ? t("who.me") : name.trim() || (msisdn ? formatMsisdn(msisdn) : "");

  function onNumber(value: string) {
    setNumber(value);
    const suggested = operatorFor((toE164(value, "CI") ?? "").replace(/\D/g, ""));
    if (suggested) setOperator(suggested);
    setProductId(null);
  }

  function quote(c: "EUR" | "USD" | "CAD", priceXof: number) {
    setCharged(null);
    startTransition(async () => setCharged((await getQuote(priceXof, c))?.base_amount ?? null));
  }

  function choosePay(p: PayWith) {
    setPayWith(p);
    if (p === "card" && product) quote(currency, product.price_xof);
  }

  function next() {
    setError(null);
    if (step === 1 && (!validNumber || !operator)) return setError(t("errors.number"));
    if (step === 2 && !product) return setError(t("errors.product"));
    if (step === 2 && payWith === "card") quote(currency, product!.price_xof);
    setStep((s) => s + 1);
  }

  function pay(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    let card: { token: string; brand: string; last4: string } | undefined;
    if (payWith === "card") {
      const token = tokenizeCard({ number: cardNumber, expiry, cvc });
      if ("error" in token) return setError(t("errors.card"));
      card = token;
    }
    startTransition(async () => {
      const result = await buyTopup({
        requestKey,
        number: msisdn!,
        name: who === "me" ? "" : name,
        operator: operator!,
        productId: product!.id,
        payWith,
        currency: payWith === "card" ? currency : "XOF",
        card,
        save: save && who === "other",
      });
      if (result?.error) setError(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-semibold text-muted-foreground">{t("step", { current: step, total: STEPS })}</p>

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("who.title")}</h2>
          <div className="grid grid-cols-2 gap-2">
            <Choice
              selected={who === "me"}
              onSelect={() => {
                setWho("me");
                setOperator(myNumber ? operatorFor(myNumber) : null);
                setProductId(null);
              }}
              className={cn(!myNumber && "opacity-60")}
            >
              <User aria-hidden className="size-6 shrink-0" />
              <span>
                <span className="block font-semibold">{t("who.me")}</span>
                <span className="block text-xs text-muted-foreground">{myNumber ? formatMsisdn(myNumber) : t("who.meHint")}</span>
              </span>
            </Choice>
            <Choice selected={who === "other"} onSelect={() => setWho("other")}>
              <Users aria-hidden className="size-6 shrink-0" />
              <span>
                <span className="block font-semibold">{t("who.other")}</span>
                <span className="block text-xs text-muted-foreground">{t("who.otherHint")}</span>
              </span>
            </Choice>
          </div>
          {who === "me" && !myNumber && <p className="text-sm text-destructive">{t("noPhone")}</p>}
          {who === "other" && (
            <>
              {saved.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold">{t("saved")}</p>
                  <div className="flex flex-wrap gap-2">
                    {saved.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={msisdn === s.msisdn}
                        onClick={() => {
                          setNumber(formatMsisdn(s.msisdn).replace("+225 ", ""));
                          setName(s.name);
                          setOperator(s.operator);
                          setProductId(null);
                        }}
                        className={cn("min-h-12 rounded-full border-2 px-4 text-sm font-semibold", msisdn === s.msisdn ? "border-primary" : "border-border")}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Field label={t("number")} htmlFor="topupNumber" hint={t("numberHint")}>
                <input id="topupNumber" type="tel" inputMode="tel" autoComplete="tel-national" value={number} onChange={(e) => onNumber(e.target.value)} placeholder="07 00 00 00 00" className={cn(inputClass, "tabular-nums")} />
              </Field>
              <Field label={t("name")} htmlFor="topupName">
                <input id="topupName" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </Field>
            </>
          )}
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">{t("operator")}</legend>
            <p className="mb-2 text-xs text-muted-foreground">{t("operatorHint")}</p>
            <div className="grid grid-cols-3 gap-2">
              {OPERATORS.map((op) => (
                <button
                  key={op}
                  type="button"
                  aria-pressed={operator === op}
                  onClick={() => {
                    setOperator(op);
                    setProductId(null);
                  }}
                  className={cn("min-h-12 rounded-lg border-2 px-2 text-sm font-semibold", operator === op ? "border-primary" : "border-border text-muted-foreground")}
                >
                  {t(`operators.${op}`)}
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("choose.title")}</h2>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["data", "airtime"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  setProductId(null);
                }}
                className={cn("min-h-12 rounded-md font-semibold", kind === k ? "bg-card shadow-sm" : "text-muted-foreground")}
              >
                {t(`choose.${k}`)}
              </button>
            ))}
          </div>
          <ul className="flex flex-col gap-2">
            {choices.map((p) => (
              <li key={p.id}>
                <Choice selected={productId === p.id} onSelect={() => setProductId(p.id)}>
                  {p.type === "data" ? <Smartphone aria-hidden className="size-6 shrink-0" /> : <Wallet aria-hidden className="size-6 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.data_mb ? formatVolume(p.data_mb, locale) : p.label}</span>
                    <span className="block text-sm text-muted-foreground">{p.validity_days ? t("validity", { days: p.validity_days }) : p.label}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(p.price_xof)}</span>
                </Choice>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 3 && product && (
        <form onSubmit={pay} noValidate className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("review.title")}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border bg-card p-4">
            <dt className="text-muted-foreground">{t("review.product")}</dt>
            <dd className="text-right font-semibold">{product.label}</dd>
            <dt className="text-muted-foreground">{t("review.recipient")}</dt>
            <dd className="text-right">
              {beneficiary}
              <span className="block text-sm text-muted-foreground tabular-nums">
                {msisdn ? formatMsisdn(msisdn) : ""} · {t(`operators.${operator!}`)}
              </span>
            </dd>
            <dt className="text-muted-foreground">{t("review.price")}</dt>
            <dd className="text-right tabular-nums">{money(product.price_xof)}</dd>
            <dt className="text-muted-foreground">{t("review.fee")}</dt>
            <dd className="text-right tabular-nums">{t("review.feeValue")}</dd>
            <dt className="text-muted-foreground">{t("review.validity")}</dt>
            <dd className="text-right">{product.validity_days ? t("validity", { days: product.validity_days }) : t("review.noValidity")}</dd>
            <dt className="font-semibold">{t("review.total")}</dt>
            <dd className="text-right font-bold tabular-nums">{money(product.price_xof)}</dd>
          </dl>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">{t("review.payWith")}</legend>
            <Choice selected={payWith === "balance"} onSelect={() => choosePay("balance")} className={cn(balance < product.price_xof && "opacity-60")}>
              <Wallet aria-hidden className="size-5 shrink-0" />
              <span className="flex-1">{t("review.balance", { amount: money(balance) })}</span>
              {balance < product.price_xof && <span className="text-xs text-muted-foreground">{t("review.lowBalance")}</span>}
            </Choice>
            {mobileMoney ? (
              <Choice selected={payWith === "mobile_money"} onSelect={() => choosePay("mobile_money")}>
                <Smartphone aria-hidden className="size-5 shrink-0" />
                <span>{t("review.mobileMoney", { account: mobileMoney })}</span>
              </Choice>
            ) : (
              <p className="text-sm text-muted-foreground">{t("review.noMobileMoney")}</p>
            )}
            {allowCard && (
              <Choice selected={payWith === "card"} onSelect={() => choosePay("card")}>
                <CreditCard aria-hidden className="size-5 shrink-0" />
                <span>{t("review.card")}</span>
              </Choice>
            )}
          </fieldset>

          {payWith === "card" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                {(["EUR", "USD", "CAD"] as const).map((c) => (
                  <button key={c} type="button" aria-pressed={currency === c} onClick={() => {
                      setCurrency(c);
                      quote(c, product.price_xof);
                    }}
                    className={cn("min-h-12 rounded-md font-semibold", currency === c ? "bg-card shadow-sm" : "text-muted-foreground")}>
                    {c}
                  </button>
                ))}
              </div>
              <p className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
                <span className="text-muted-foreground">{t("review.charged")}</span>
                <span className="font-bold tabular-nums">{charged === null ? "…" : money(charged, currency)}</span>
              </p>
              <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                <Lock aria-hidden className="size-4 shrink-0" />
                {t("review.testCard", { card: SANDBOX_TEST_CARDS.success })}
              </p>
              <Field label={t("review.cardNumber")} htmlFor="cardNumber">
                <input id="cardNumber" inputMode="numeric" autoComplete="cc-number" value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} placeholder="4242 4242 4242 4242" className={cn(inputClass, "tabular-nums")} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("review.expiry")} htmlFor="expiry">
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
                <Field label={t("review.cvc")} htmlFor="cvc">
                  <input id="cvc" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, ""))} className={cn(inputClass, "tabular-nums")} />
                </Field>
              </div>
            </div>
          )}

          {who === "other" && !isSaved && (
            <label htmlFor={saveId} className="flex min-h-12 items-center gap-3">
              <input id={saveId} type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="size-5 accent-primary" />
              {t("review.save")}
            </label>
          )}
          {error && (
            <p role="alert" className="font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" variant="accent" disabled={pending || (payWith === "balance" && balance < product.price_xof) || (payWith === "card" && charged === null)}>
            {pending ? t("paying") : t("pay", { total: payWith === "card" && charged !== null ? money(charged, currency) : money(product.price_xof) })}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => setStep(2)}>
            {t("back")}
          </Button>
        </form>
      )}

      {step < 3 && (
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
            <Button type="button" size="lg" onClick={next}>
              {t("next")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
