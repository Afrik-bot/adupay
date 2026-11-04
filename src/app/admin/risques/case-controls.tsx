"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { clearSanctions, updateCase } from "../actions";

type Status = "open" | "reviewing" | "closed" | "escalated";

export function CaseControls({ id, status, sanctions }: { id: string; status: Status; sanctions: { kind: "profile" | "payee"; id: string } | null }) {
  const t = useTranslations("admin.risks");
  const [next, setNext] = useState<Status>(status === "open" ? "reviewing" : status);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noteId = useId();
  const statusId = useId();
  const run = (fn: () => Promise<{ ok: true } | { error: string }>) =>
    startTransition(async () => {
      const result = await fn();
      setMessage("error" in result ? result.error : t("saved"));
      if ("ok" in result) setNote("");
    });

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
        <label htmlFor={statusId} className="sr-only">
          {t("newStatus")}
        </label>
        <select id={statusId} value={next} onChange={(e) => setNext(e.target.value as Status)} className={inputClass}>
          {(["open", "reviewing", "escalated", "closed"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </select>
        <label htmlFor={noteId} className="sr-only">
          {t("note")}
        </label>
        <input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} className={inputClass} />
        <Button size="sm" disabled={pending || !note.trim()} onClick={() => run(() => updateCase(id, next, note))}>
          {t("save")}
        </Button>
      </div>
      {sanctions && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !note.trim()}
          onClick={() => run(() => clearSanctions(sanctions.kind, sanctions.id, note))}
        >
          {t("falsePositive")}
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
