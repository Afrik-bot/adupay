"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Approve / reject with a mandatory reason for rejections. */
export function Decision({ onDecide }: { onDecide: (approve: boolean, reason: string) => Promise<{ ok: true } | { error: string }> }) {
  const t = useTranslations("admin.decision");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonId = useId();
  const decide = (approve: boolean) =>
    startTransition(async () => {
      const result = await onDecide(approve, reason);
      setError("error" in result ? result.error : null);
    });

  return (
    <div className="flex flex-col gap-2">
      {rejecting && (
        <>
          <label htmlFor={reasonId} className="sr-only">
            {t("reasonLabel")}
          </label>
          <input
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            className={inputClass}
          />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {!rejecting ? (
          <>
            <Button size="sm" variant="accent" disabled={pending} onClick={() => decide(true)}>
              {t("approve")}
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(true)}>
              {t("reject")}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="destructive" disabled={pending || !reason.trim()} onClick={() => decide(false)}>
              {t("confirmReject")}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(false)}>
              {t("cancel")}
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className={cn("text-sm text-destructive")}>
          {error}
        </p>
      )}
    </div>
  );
}
