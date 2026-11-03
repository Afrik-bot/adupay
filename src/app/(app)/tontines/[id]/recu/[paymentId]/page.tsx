import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatMoney, type Currency, type Locale } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { requireProfile } from "@/server/auth";
import { AutoRefresh } from "./auto-refresh";

const STATUS = {
  pending: { icon: Clock, className: "text-warning" },
  succeeded: { icon: CheckCircle2, className: "text-success" },
  failed: { icon: XCircle, className: "text-destructive" },
} as const;

export default async function ReceiptPage({ params }: { params: Promise<{ id: string; paymentId: string }> }) {
  await requireProfile();
  const { id, paymentId } = await params;
  const t = await getTranslations("tontines.receipt");
  const home = await getTranslations("home");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();

  // RLS: only the payer can read their payment.
  const [{ data: payment }, { data: group }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount, currency, status, failure_code, provider_ref, created_at, updated_at, purpose_id")
      .eq("id", paymentId)
      .maybeSingle(),
    supabase.from("groups").select("name").eq("id", id).maybeSingle(),
  ]);
  if (!payment || !group) notFound();

  const { icon: Icon, className } = STATUS[payment.status];
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Abidjan",
  });

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/tontines/${id}`} className="flex min-h-12 w-fit items-center gap-2 font-semibold">
        <ArrowLeft aria-hidden className="size-5" />
        {group.name}
      </Link>
      <Card className="items-center gap-3 text-center">
        <Icon aria-hidden className={cn("size-14", className)} />
        <h1 className="text-2xl font-bold">{t(`title.${payment.status}`)}</h1>
        <p className="text-3xl font-extrabold tabular-nums">
          {formatMoney(payment.amount, payment.currency as Currency, locale)}
        </p>
        <p className="text-muted-foreground">{t("for", { name: group.name })}</p>
        <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", className, "bg-muted")}>
          {home(`status.${payment.status}`)}
        </span>
        {payment.status === "pending" && <p className="text-sm text-muted-foreground">{t("pendingHint")}</p>}
        {payment.status === "failed" && (
          <p className="text-sm text-destructive">{t("failedHint", { code: payment.failure_code ?? "" })}</p>
        )}
      </Card>
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("date")}</dt>
          <dd>{when.format(new Date(payment.created_at))}</dd>
          <dt className="text-muted-foreground">{t("receiptNo")}</dt>
          <dd className="font-mono break-all">{payment.id.slice(0, 8).toUpperCase()}</dd>
          {payment.provider_ref && (
            <>
              <dt className="text-muted-foreground">{t("railRef")}</dt>
              <dd className="font-mono break-all">{payment.provider_ref.slice(-12)}</dd>
            </>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">{t("sandbox")}</p>
      </Card>
      {payment.status === "pending" && <AutoRefresh />}
    </div>
  );
}
