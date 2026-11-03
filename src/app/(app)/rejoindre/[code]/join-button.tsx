"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { joinTontine, type JoinError } from "../../tontines/actions";

export function JoinButton({ code }: { code: string }) {
  const t = useTranslations("tontines.invite");
  const [error, setError] = useState<JoinError | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        variant="accent"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await joinTontine(code);
            if (result?.error) setError(result.error);
          })
        }
      >
        {t("join")}
      </Button>
      {error && (
        <p role="alert" className="font-medium text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
