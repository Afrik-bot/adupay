"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/i18n/actions";
import { cn } from "@/lib/utils";

export function LanguageToggle({ locale, label, className }: { locale: string; label: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={label} className={cn("flex rounded-lg border p-0.5", pending && "opacity-60", className)}>
      {(["fr", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={locale === code}
          onClick={() =>
            startTransition(async () => {
              await setLocale(code);
              router.refresh();
            })
          }
          className={cn(
            "min-h-12 min-w-12 rounded-md px-2 text-sm font-semibold uppercase",
            locale === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
