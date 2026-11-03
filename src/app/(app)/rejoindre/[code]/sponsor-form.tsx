"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { joinAsSponsor, type SponsorError } from "../../tontines/actions";

export function SponsorForm({ code, members }: { code: string; members: { user_id: string; first_name: string }[] }) {
  const t = useTranslations("tontines.sponsor");
  const [memberId, setMemberId] = useState(members[0]?.user_id ?? "");
  const [error, setError] = useState<SponsorError | null>(null);
  const [pending, startTransition] = useTransition();
  if (!members.length) return null;

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <HeartHandshake aria-hidden className="size-5" />
        {t("title")}
      </CardTitle>
      <CardDescription>{t("lead")}</CardDescription>
      <Field label={t("member")} htmlFor="sponsoredMember">
        <select id="sponsoredMember" value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputClass}>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.first_name}
            </option>
          ))}
        </select>
      </Field>
      <Button
        variant="outline"
        size="lg"
        disabled={pending || !memberId}
        onClick={() =>
          startTransition(async () => {
            const result = await joinAsSponsor(code, memberId);
            if (result?.error) setError(result.error);
          })
        }
      >
        {t("submit")}
      </Button>
      {error && (
        <p role="alert" className="font-medium text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
    </Card>
  );
}
