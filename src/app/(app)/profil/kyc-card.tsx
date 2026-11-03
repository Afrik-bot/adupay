import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, type Locale } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type KycRecord = Pick<Tables<"kyc_records">, "id" | "document_type" | "status" | "rejection_reason" | "created_at">;

const STATUS_STYLES = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
} as const;

export async function KycCard({
  tier,
  limit,
  used,
  records,
}: {
  tier: number;
  limit: number;
  used: number;
  records: KycRecord[];
}) {
  const t = await getTranslations("kyc");
  const locale = (await getLocale()) as Locale;
  const pending = records.some((r) => r.status === "pending");
  const next = tier === 0 ? "Id" : tier === 1 ? "Address" : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t("title")}</CardTitle>
          <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
            <ShieldCheck aria-hidden className="size-4" />
            {t("tier", { tier })}
          </span>
        </div>
        <p className="font-medium">{t(`tierNames.t${tier}` as "tierNames.t0")}</p>
      </CardHeader>

      {limit === 0 ? (
        <p className="text-muted-foreground">{t("noPayments")}</p>
      ) : (
        <div className="flex flex-col gap-1 text-muted-foreground">
          <p>{t("limit", { limit: formatMoney(limit, "XOF", locale) })}</p>
          <p>{t("used", { used: formatMoney(used, "XOF", locale) })}</p>
          <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden>
            <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
          </div>
        </div>
      )}

      {pending ? (
        <p className="rounded-lg bg-muted p-3 text-sm">{t("pendingNotice")}</p>
      ) : next ? (
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link href="/profil/verification">
              {t(`next${next}`)}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">{t(`next${next}Hint`)}</p>
        </div>
      ) : (
        <p className="text-muted-foreground">{t("done")}</p>
      )}

      {records.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{t("documents")}</h3>
          <ul className="mt-2 divide-y">
            {records.map((record) => (
              <li key={record.id} className="flex flex-col gap-1 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{t(`docTypes.${record.document_type}` as "docTypes.cni")}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLES[record.status])}>
                    {t(`status.${record.status}`)}
                  </span>
                </div>
                {record.status === "rejected" && record.rejection_reason && (
                  <p className="text-sm text-destructive">{t("rejectedReason", { reason: record.rejection_reason })}</p>
                )}
                <a
                  href={`/api/kyc/documents/${record.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-12 w-fit items-center text-sm font-semibold underline-offset-4 hover:underline"
                >
                  {t("view")}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
