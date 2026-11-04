"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmReceipt } from "./actions";

export function ConfirmButton({ id }: { id: string }) {
  const t = useTranslations("payee");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="accent"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await confirmReceipt(id);
            setError(Boolean(result?.error));
          })
        }
      >
        <CheckCircle2 aria-hidden />
        {t("confirm")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("confirmError")}
        </p>
      )}
    </div>
  );
}
