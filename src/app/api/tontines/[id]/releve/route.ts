import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { formatMoney, type Currency } from "@/lib/money";
import { renderTablePdf } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Statement of a tontine for its manager: ?format=csv (Excel-friendly) or ?format=pdf. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: group } = await supabase.from("groups").select("name, manager_id").eq("id", id).maybeSingle();
  if (!group || group.manager_id !== userId) return NextResponse.json({ ok: false }, { status: 404 });
  const { data: manager } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
  const { data: rows } = await supabase.rpc("group_statement", { p_group_id: id });

  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : defaultLocale;
  const t = await getTranslations({ locale, namespace: "statement" });
  const dateFormat = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Abidjan",
  });
  const today = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "long", timeZone: "Africa/Abidjan" }).format(new Date());

  const lines = (rows ?? []).map((r) => [
    dateFormat.format(new Date(r.occurred_at)),
    String(r.cycle_number),
    t(`types.${r.entry_type}` as "types.contribution"),
    r.member_name ?? "",
    formatMoney(r.amount, r.currency as Currency, locale),
    t(`statuses.${r.status}` as "statuses.succeeded"),
    r.reference ? r.reference.slice(-12) : "",
  ]);
  const headers = [t("date"), t("round"), t("type"), t("member"), t("amount"), t("status"), t("reference")];
  const filename = `releve-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tontine"}`;

  if (format === "csv") {
    // BOM + semicolons: opens correctly in French Excel.
    const csv = "﻿" + [headers, ...lines].map((line) => line.map(csvCell).join(";")).join("\r\n") + "\r\n";
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const pdf = renderTablePdf({
    title: t("title", { name: group.name }),
    subtitle: [t("manager", { name: manager?.full_name ?? "" }), t("issued", { date: today })],
    columns: [
      { header: headers[0], x: 40, width: 80 },
      { header: headers[1], x: 125 },
      { header: headers[2], x: 155, width: 70 },
      { header: headers[3], x: 230, width: 130 },
      { header: headers[4], x: 440, align: "right" },
      { header: headers[5], x: 450, width: 60 },
      { header: headers[6], x: 515, width: 45 },
    ],
    rows: lines,
    footer: t("footer"),
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
