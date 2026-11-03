"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { inputClass } from "@/components/ui/field";

/** Paste an invite link or type its code; opens the invite page to preview first. */
export function JoinByCode() {
  const t = useTranslations("tontines.join");
  const router = useRouter();
  const [value, setValue] = useState("");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = value.trim().split("/").filter(Boolean).pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (code) router.push(`/rejoindre/${code}`);
  }

  return (
    <Card>
      <CardTitle>{t("title")}</CardTitle>
      <CardDescription>{t("lead")}</CardDescription>
      <form onSubmit={onSubmit} className="flex gap-2">
        <label htmlFor="inviteCode" className="sr-only">
          {t("label")}
        </label>
        <input
          id="inviteCode"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("placeholder")}
          autoCapitalize="off"
          className={inputClass}
        />
        <Button type="submit" variant="outline" disabled={!value.trim()}>
          {t("submit")}
        </Button>
      </form>
    </Card>
  );
}
