"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { HandCoins, Home, PiggyBank, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/accueil", key: "home", icon: Home },
  { href: "/tontines", key: "tontines", icon: Users },
  { href: "/payer-pour", key: "payFor", icon: HandCoins },
  { href: "/epargne", key: "savings", icon: PiggyBank },
  { href: "/profil", key: "profile", icon: User },
] as const;

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("rounded-full px-4 py-1", active && "bg-accent text-accent-foreground")}>
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="truncate">{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
