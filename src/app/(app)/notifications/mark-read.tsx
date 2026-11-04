"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { markAllRead } from "./actions";

export function MarkRead() {
  const t = useTranslations("notifications");
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(() => markAllRead())}>
      {t("markRead")}
    </Button>
  );
}
