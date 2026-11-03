"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { setScheduleStatus } from "./actions";

export function ScheduleButtons({ scheduleId, status }: { scheduleId: string; status: "active" | "paused" }) {
  const t = useTranslations("payFor");
  const [pending, startTransition] = useTransition();
  const set = (next: "active" | "paused" | "cancelled") => startTransition(() => setScheduleStatus(scheduleId, next));
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => set(status === "active" ? "paused" : "active")}>
        {status === "active" ? t("pause") : t("resume")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() => {
          if (window.confirm(t("cancelConfirm"))) set("cancelled");
        }}
      >
        {t("cancelSchedule")}
      </Button>
    </div>
  );
}
