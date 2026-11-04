"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function PayeeNav() {
  const t = useTranslations("payee.nav");
  const path = usePathname();
  const items = [
    { href: "/payee", label: t("payments") },
    { href: "/payee/parametres", label: t("settings") },
  ];
  return (
    <nav aria-label={t("label")}>
      <ul className="flex gap-1">
        {items.map((item) => {
          const active = item.href === "/payee" ? path === "/payee" : path.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center rounded-lg px-3 text-sm font-semibold",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
