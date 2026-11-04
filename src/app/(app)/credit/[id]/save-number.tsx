"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveNumber } from "../actions";

export function SaveNumberButton({ msisdn, name, operator, saved }: { msisdn: string; name: string; operator: string; saved: boolean }) {
  const t = useTranslations("credit.receipt");
  const [done, setDone] = useState(saved);
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={done || pending}
      onClick={() =>
        startTransition(async () => {
          if ("ok" in (await saveNumber(msisdn, name, operator))) setDone(true);
        })
      }
    >
      <Star aria-hidden className={done ? "fill-current" : undefined} />
      {done ? t("savedNumber") : t("saveNumber")}
    </Button>
  );
}
