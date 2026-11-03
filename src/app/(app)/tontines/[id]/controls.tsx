"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Copy, MessageCircle, Play, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { payMyShare, startTontine } from "../actions";
import type { PayShareError } from "@/server/tontines";

const noSubscribe = () => () => {};

export function InviteShare({ url, code, message }: { url: string; code: string; message: string }) {
  const t = useTranslations("tontines.group");
  const [copied, setCopied] = useState(false);
  // false on the server and during hydration, the real value afterwards.
  const canShare = useSyncExternalStore(
    noSubscribe,
    () => "share" in navigator,
    () => false,
  );

  return (
    <Card>
      <CardTitle>{t("inviteTitle")}</CardTitle>
      <CardDescription>{t("inviteLead")}</CardDescription>
      <p className="rounded-lg bg-muted px-3 py-2 font-mono text-sm break-all">{url}</p>
      <p className="text-sm text-muted-foreground">{t("inviteCode", { code })}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="accent">
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            {t("shareWhatsApp")}
          </a>
        </Button>
        {canShare ? (
          <Button variant="outline" onClick={() => navigator.share({ text: message }).catch(() => {})}>
            <Share2 aria-hidden />
            {t("share")}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(url).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }
          >
            <Copy aria-hidden />
            {copied ? t("copied") : t("copy")}
          </Button>
        )}
      </div>
    </Card>
  );
}

export function StartButton({ groupId, disabled }: { groupId: string; disabled: boolean }) {
  const t = useTranslations("tontines.group");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        disabled={disabled || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startTontine(groupId);
            setError(Boolean(result?.error));
          })
        }
      >
        <Play aria-hidden />
        {t("start")}
      </Button>
      <p className="text-sm text-muted-foreground">{disabled ? t("startNeedsTwo") : t("startHint")}</p>
      {error && (
        <p role="alert" className="font-medium text-destructive">
          {t("startError")}
        </p>
      )}
    </div>
  );
}

const ERROR_LINKS: Partial<Record<PayShareError, string>> = {
  noAccount: "/profil/comptes",
  relinkAccount: "/profil/comptes",
  kycRequired: "/profil/verification",
};

export function PayShareButton({ groupId, label }: { groupId: string; label: string }) {
  const t = useTranslations("tontines.pay");
  const [error, setError] = useState<PayShareError | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        variant="accent"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await payMyShare(groupId);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? t("paying") : label}
      </Button>
      {error && (
        <p role="alert" className="font-medium text-destructive">
          {t(`errors.${error}`)}{" "}
          {ERROR_LINKS[error] && (
            <Link href={ERROR_LINKS[error]!} className="underline underline-offset-4">
              {t(`fix.${error}` as "fix.noAccount")}
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
