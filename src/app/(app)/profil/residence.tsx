"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { setUserType } from "./actions";

/** "Où vivez-vous ?" — chosen at onboarding, editable here (it decides e.g. card top-ups). */
export function Residence({ value }: { value: "resident" | "diaspora" | null }) {
  const t = useTranslations("onboarding.type");
  const [current, setCurrent] = useState(value);
  const [pending, startTransition] = useTransition();
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border bg-card p-5">
      <legend className="sr-only">{t("title")}</legend>
      <p className="font-semibold">{t("title")}</p>
      <div className="grid grid-cols-2 gap-2">
        {(["resident", "diaspora"] as const).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={current === type}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if ("ok" in (await setUserType(type))) setCurrent(type);
              })
            }
            className={cn("min-h-12 rounded-lg border-2 px-3 text-sm font-semibold", current === type ? "border-primary" : "border-border text-muted-foreground")}
          >
            {t(type)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
