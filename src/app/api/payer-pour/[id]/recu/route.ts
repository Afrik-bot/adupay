import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { formatMoney, type Currency } from "@/lib/money";
import { renderTablePdf } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** PDF receipt for the sender of a Payer pour payment (RLS: only they can read it). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: dp } = await supabase
    .from("directed_payments")
    .select("id, sender_id, purpose, payee_id, group_id, beneficiary_name, reference, amount, source_currency, source_amount, fee_amount, fx_rate, status, card_last4, created_at, paid_at, received_at, confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (!dp || dp.sender_id !== claims.claims.sub) return NextResponse.json({ ok: false }, { status: 404 });
  const { data: target } =
    dp.purpose === "tontine"
      ? await supabase.from("groups").select("name").eq("id", dp.group_id!).maybeSingle()
      : await supabase.from("payees").select("name").eq("id", dp.payee_id!).maybeSingle();
  const { data: sender } = await supabase.from("profiles").select("full_name").eq("id", dp.sender_id).single();

  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : defaultLocale;
  const t = await getTranslations({ locale, namespace: "payFor" });
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });
  const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : "—");
  const source = dp.source_currency as Currency;

  const rows: [string, string][] = [
    [t("receipt.number"), dp.id.slice(0, 8).toUpperCase()],
    [t("receipt.sender"), sender?.full_name ?? ""],
    [t("receipt.purpose"), t(`purposes.${dp.purpose}`)],
    [t("receipt.payee"), target?.name ?? ""],
    [t("beneficiary"), dp.beneficiary_name],
    [t("receipt.reference"), dp.reference ?? "—"],
    [t("receipt.delivered"), formatMoney(dp.amount, "XOF", locale)],
    [t("rate"), `1 ${dp.source_currency} = ${Number(dp.fx_rate).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 3 })} FCFA`],
    [t("feeIncluded"), formatMoney(dp.fee_amount, source, locale)],
    [t("charged"), formatMoney(dp.source_amount, source, locale)],
    [t("card"), dp.card_last4 ? `•••• ${dp.card_last4}` : "—"],
    [t("receipt.status"), t(`status.${dp.status}`)],
    [t("timeline.paid"), fmt(dp.paid_at)],
    [t("timeline.received"), fmt(dp.received_at)],
    [t("timeline.confirmed"), fmt(dp.confirmed_at)],
  ];

  const pdf = renderTablePdf({
    title: t("receipt.title"),
    subtitle: [fmt(dp.created_at)],
    columns: [
      { header: "", x: 40, width: 170 },
      { header: "", x: 220, width: 335 },
    ],
    rows,
    footer: t("receipt.footer"),
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="recu-adupay-${dp.id.slice(0, 8)}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
