import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Check, Database, Gift, Globe, Landmark, Receipt, ShieldCheck, Smartphone, UserCheck, Wifi } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { Logo } from "@/components/logo";
import { DirectedPayShape, LedgerShape, ScoreShape, TontineCircle } from "@/components/marketing/illustrations";
import { Button } from "@/components/ui/button";

type Step = { title: string; body: string };
type Item = { title: string; body: string };
type Faq = { q: string; a: string };

const PILLARS = [
  { key: "tontine", id: "tontines", Shape: LedgerShape },
  { key: "payFor", id: "payer-pour", Shape: DirectedPayShape },
  { key: "score", id: "score", Shape: ScoreShape },
] as const;

const TRUST_ICONS = [Landmark, Database, UserCheck, ShieldCheck];
const CONNECT_ICONS = [Smartphone, Wifi, Globe, Receipt];

export default async function LandingPage() {
  const t = await getTranslations("landing");
  const locale = await getLocale();
  const steps = t.raw("how.steps") as Step[];
  const trust = t.raw("trust.items") as Item[];
  const connectPoints = t.raw("connect.points") as Item[];
  const faqs = t.raw("faq.items") as Faq[];
  const percent = (value: number) => (locale === "fr" ? `${String(value).replace(".", ",")} %` : `${value}%`);

  // Fee bars: market figures from the PRD sources; AduPay's is a stated target.
  const fees = [
    { label: t("fees.market"), value: 8, display: `~${percent(8)}` },
    { label: t("fees.waemu"), value: 6.3, display: percent(6.3) },
    { label: t("fees.adupay"), value: 3, display: `${t("fees.below")} ${percent(3)}`, target: true },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/" className="flex min-h-12 items-center text-lg text-foreground" aria-label="AduPay">
            <Logo />
          </Link>
          <nav aria-label={t("nav.menu")} className="hidden md:block">
            <ul className="flex gap-1 text-sm font-medium">
              {(
                [
                  ["#tontines", "tontines"],
                  ["#payer-pour", "payFor"],
                  ["#score", "score"],
                  ["#credit-data", "credit"],
                  ["#faq", "faq"],
                ] as const
              ).map(([href, key]) => (
                <li key={href}>
                  <a href={href} className="flex min-h-12 items-center rounded-md px-3 text-muted-foreground hover:text-foreground">
                    {t(`nav.${key}`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle locale={locale} label={t("nav.language")} />
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/accueil">{t("nav.open")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-brand-indigo text-brand-offwhite">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-[1.1fr_1fr] md:py-24">
            <div className="flex flex-col gap-6">
              <p className="w-fit rounded-full border border-brand-saffron/40 px-3 py-1 text-sm font-medium text-brand-saffron">
                {t("badge")}
              </p>
              <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                {t("hero.title")}
              </h1>
              <p className="max-w-xl text-lg text-brand-offwhite/80">{t("hero.lead")}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild variant="accent" size="lg">
                  <Link href="/tontines">
                    {t("hero.primary")}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-brand-offwhite/30 bg-transparent text-brand-offwhite hover:bg-brand-offwhite/10"
                >
                  <a href="#payer-pour">{t("hero.secondary")}</a>
                </Button>
              </div>
              <p className="text-sm text-brand-offwhite/70">{t("hero.wallets")}</p>
            </div>
            <TontineCircle className="mx-auto w-full max-w-[22rem]" />
          </div>
        </section>

        {/* Pillars */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t("pillars.eyebrow")}</p>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {PILLARS.map(({ key, id, Shape }) => (
              <article id={id} key={key} className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border bg-card p-6">
                <Shape className="h-32 w-auto self-start text-foreground" />
                <h2 className="text-2xl font-bold">{t(`pillars.${key}.title`)}</h2>
                <p className="text-lg font-medium">{t(`pillars.${key}.lead`)}</p>
                <ul className="flex flex-col gap-2 text-muted-foreground">
                  {(t.raw(`pillars.${key}.points`) as string[]).map((point) => (
                    <li key={point} className="flex gap-2">
                      <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-foreground" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* How Payer pour works */}
        <section className="border-y bg-secondary/60">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t("how.eyebrow")}</p>
            <h2 className="mt-2 text-3xl font-bold text-balance">{t("how.title")}</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="mt-1 text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* AduPay Connect: airtime & data, and data rewards */}
        <section id="credit-data" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 md:py-24">
          <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-start">
            <div>
              <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t("connect.eyebrow")}</p>
              <h2 className="mt-2 text-3xl font-bold text-balance">{t("connect.title")}</h2>
              <p className="mt-3 text-lg text-muted-foreground">{t("connect.lead")}</p>
              <ul className="mt-8 grid gap-6 sm:grid-cols-2">
                {connectPoints.map((point, i) => {
                  const Icon = CONNECT_ICONS[i];
                  return (
                    <li key={point.title} className="flex gap-3">
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                        <Icon aria-hidden className="size-6" />
                      </span>
                      <div>
                        <h3 className="text-lg font-semibold">{point.title}</h3>
                        <p className="mt-1 text-muted-foreground">{point.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Button asChild size="lg" className="mt-8">
                <Link href="/credit">
                  {t("connect.cta")}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>

            <div className="flex flex-col gap-5 rounded-2xl bg-brand-indigo p-6 text-brand-offwhite md:p-8">
              <Gift aria-hidden className="size-8 text-brand-saffron" />
              <p className="text-sm font-semibold tracking-wide text-brand-saffron uppercase">{t("connect.rewardEyebrow")}</p>
              <h3 className="text-2xl font-bold text-balance">{t("connect.rewardTitle")}</h3>
              <p className="text-brand-offwhite/80">{t("connect.rewardBody")}</p>
              <figure className="rounded-xl bg-brand-offwhite p-4 text-brand-indigo shadow-sm">
                <figcaption className="text-xs font-medium text-brand-indigo/70">{t("connect.notificationLabel")}</figcaption>
                <p className="mt-1 flex gap-2 font-medium">
                  <Wifi aria-hidden className="mt-0.5 size-5 shrink-0" />
                  {t("connect.notification")}
                </p>
              </figure>
            </div>
          </div>
          <p className="mt-8 text-sm text-muted-foreground">{t("connect.note")}</p>
        </section>

        {/* Fee comparison */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="grid gap-10 md:grid-cols-[1fr_1.3fr] md:items-center">
            <div>
              <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t("fees.eyebrow")}</p>
              <h2 className="mt-2 text-3xl font-bold text-balance">{t("fees.title")}</h2>
              <p className="mt-3 text-muted-foreground">{t("fees.caption")}</p>
            </div>
            <figure className="rounded-2xl border bg-card p-6">
              <dl className="flex flex-col gap-5">
                {fees.map((fee) => (
                  <div key={fee.label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="font-medium">{fee.label}</dt>
                      <dd className="text-lg font-bold tabular-nums">{fee.display}</dd>
                    </div>
                    <div className="mt-2 h-4 rounded-full bg-muted" aria-hidden>
                      <div
                        className={fee.target ? "h-4 rounded-full bg-accent" : "h-4 rounded-full bg-primary/70"}
                        style={{ width: `${(fee.value / 8) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </dl>
              <figcaption className="mt-6 text-sm text-muted-foreground">{t("fees.note")}</figcaption>
            </figure>
          </div>
        </section>

        {/* Trust */}
        <section className="bg-brand-indigo text-brand-offwhite">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <p className="text-sm font-semibold tracking-wide text-brand-saffron uppercase">{t("trust.eyebrow")}</p>
            <h2 className="mt-2 text-3xl font-bold">{t("trust.title")}</h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {trust.map((item, i) => {
                const Icon = TRUST_ICONS[i];
                return (
                  <li key={item.title} className="flex flex-col gap-3">
                    <Icon aria-hidden className="size-7 text-brand-saffron" />
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <p className="text-brand-offwhite/75">{item.body}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-16 md:py-24">
          <h2 className="text-3xl font-bold">{t("faq.title")}</h2>
          <div className="mt-6 divide-y rounded-2xl border bg-card">
            {faqs.map((faq) => (
              <details key={faq.q} className="group px-5">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span aria-hidden className="text-2xl leading-none transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="pb-5 text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-16 md:pb-24">
          <div className="flex flex-col items-start gap-5 rounded-3xl bg-accent p-8 text-accent-foreground md:flex-row md:items-center md:justify-between md:p-12">
            <div>
              <h2 className="text-3xl font-bold text-balance">{t("cta.title")}</h2>
              <p className="mt-2 text-lg">{t("cta.body")}</p>
            </div>
            <Button asChild size="lg" className="bg-brand-indigo text-brand-offwhite hover:bg-brand-indigo/90">
              <Link href="/accueil">
                {t("cta.button")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:justify-between">
          <div className="flex max-w-sm flex-col gap-3">
            <Logo className="text-foreground" />
            <p className="text-muted-foreground">{t("footer.tagline")}</p>
          </div>
          <nav aria-label={t("footer.legalNav")}>
            <ul className="flex flex-col gap-1 sm:flex-row sm:gap-4">
              {(
                [
                  ["/conditions", "terms"],
                  ["/confidentialite", "privacy"],
                  ["/reclamations", "complaints"],
                  ["/payee", "payeeSpace"],
                ] as const
              ).map(([href, key]) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-12 items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    {t(`footer.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-10 text-sm text-muted-foreground">
          <p>{t("footer.legal")}</p>
          <p className="mt-1">{t("footer.rights")}</p>
        </div>
      </footer>
    </div>
  );
}
