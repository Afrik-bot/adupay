"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { grantScoreSharing, revokeScoreSharing } from "../../actions";

export function ConsentForm() {
  const t = useTranslations("savings.consent");
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-3 rounded-xl border bg-card p-4">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-5 shrink-0" />
        <span>{t("checkbox")}</span>
      </label>
      <Button size="lg" disabled={!agreed || pending} onClick={() => startTransition(() => grantScoreSharing())}>
        {t("agree")}
      </Button>
    </div>
  );
}

export function RevokeButton() {
  const t = useTranslations("savings.consent");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-success">{t("activeNow")}</p>
      <Button variant="outline" size="lg" disabled={pending} onClick={() => startTransition(() => revokeScoreSharing())}>
        {t("revoke")}
      </Button>
    </div>
  );
}
