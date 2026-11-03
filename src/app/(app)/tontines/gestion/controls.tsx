"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewPenalty, sendReminders } from "./actions";

export function ReminderButtons({ groupId }: { groupId: string }) {
  const t = useTranslations("manager");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (channel: "whatsapp" | "sms") =>
    startTransition(async () => {
      const result = await sendReminders(groupId, channel);
      setMessage("error" in result ? t("reminderError") : result.sent ? t("remindersSent", { count: result.sent }) : t("remindersAlready"));
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="accent" disabled={pending} onClick={() => send("whatsapp")}>
          <MessageCircle aria-hidden />
          {t("remindWhatsApp")}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => send("sms")}>
          <MessageSquareText aria-hidden />
          {t("remindSms")}
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm font-medium">
          {message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("simulated")}</p>
    </div>
  );
}

export function PenaltyButtons({ penaltyId, label }: { penaltyId: string; label: string }) {
  const t = useTranslations("manager");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-warning/10 p-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" disabled={pending} onClick={() => startTransition(() => reviewPenalty(penaltyId, true))}>
          {t("confirmPenalty")}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(() => reviewPenalty(penaltyId, false))}>
          {t("waivePenalty")}
        </Button>
      </div>
    </div>
  );
}
