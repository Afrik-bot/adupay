import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HandCoins, PiggyBank, Send, Smartphone, Users } from "lucide-react";
import { requireProfile } from "@/server/auth";
import {
  BalanceCard,
  BalanceSkeleton,
  LinkWalletNudge,
  ListSkeleton,
  RecentTransactions,
  UpcomingDues,
} from "./sections";

const ACTIONS = [
  { href: "/tontines", key: "payTontine", icon: Users },
  { href: "/payer-pour", key: "payFor", icon: HandCoins },
  { href: "/credit", key: "credit", icon: Smartphone },
  { href: "/envoyer", key: "send", icon: Send },
  { href: "/epargne", key: "save", icon: PiggyBank },
] as const;

/** "Bonjour" until 18:00 Abidjan time (UTC), then "Bonsoir". */
function greetingKey(now = new Date()) {
  return now.getUTCHours() >= 18 ? "evening" : "morning";
}

export default async function AccueilPage() {
  const profile = await requireProfile();
  const t = await getTranslations("home");
  const firstName = profile.full_name?.split(" ")[0] ?? "";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t(`greeting.${greetingKey()}`, { name: firstName })}</h1>

      <Suspense fallback={<BalanceSkeleton />}>
        <BalanceCard />
      </Suspense>

      <nav aria-label={t("quickActions")}>
        <ul className="grid grid-cols-5 gap-1.5">
          {ACTIONS.map(({ href, key, icon: Icon }) => (
            <li key={key}>
              <Link
                href={href}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-card p-1 text-center text-xs font-semibold hover:bg-muted"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="leading-tight">{t(`actions.${key}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Suspense fallback={null}>
        <LinkWalletNudge />
      </Suspense>

      <Suspense fallback={<ListSkeleton rows={2} />}>
        <UpcomingDues />
      </Suspense>

      <Suspense fallback={<ListSkeleton rows={4} />}>
        <RecentTransactions />
      </Suspense>
    </div>
  );
}
