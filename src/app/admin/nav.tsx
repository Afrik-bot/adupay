"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", key: "dashboard" },
  { href: "/admin/kyc", key: "kyc" },
  { href: "/admin/kyb", key: "kyb" },
  { href: "/admin/transactions", key: "transactions" },
  { href: "/admin/risques", key: "risks" },
  { href: "/admin/taux", key: "fx" },
  { href: "/admin/connect", key: "connect" },
  { href: "/admin/journal", key: "audit" },
] as const;

export function AdminNav() {
  const t = useTranslations("admin.nav");
  const path = usePathname();
  return (
    <nav aria-label={t("label")} className="border-b md:w-56 md:shrink-0 md:border-r md:border-b-0">
      <ul className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col">
        {ITEMS.map((item) => {
          const active = item.href === "/admin" ? path === "/admin" : path.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center rounded-lg px-3 text-sm font-semibold whitespace-nowrap",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
