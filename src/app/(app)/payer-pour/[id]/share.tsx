"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function ShareWithFamily({ url, message }: { url: string; message: string }) {
  const t = useTranslations("payFor");
  const [copied, setCopied] = useState(false);
  return (
    <Card>
      <CardTitle>{t("shareTitle")}</CardTitle>
      <CardDescription>{t("shareLead")}</CardDescription>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="accent">
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            {t("shareWhatsApp")}
          </a>
        </Button>
        <Button variant="outline" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true), () => {})}>
          <Copy aria-hidden />
          {copied ? t("copied") : t("copyLink")}
        </Button>
      </div>
    </Card>
  );
}
