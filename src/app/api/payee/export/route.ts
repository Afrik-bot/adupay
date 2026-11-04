import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** CSV of the business's incoming payments, with the same filters as the dashboard. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ ok: false }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const status = ["to_confirm", "confirmed", "all"].includes(params.get("statut") ?? "") ? params.get("statut")! : "all";
  const { data: rows } = await supabase.rpc("payee_incoming", {
    p_status: status,
    p_from: date(params.get("du")),
    p_to: date(params.get("au")),
    p_search: params.get("q")?.slice(0, 60) ?? undefined,
  });

  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : defaultLocale;
  const t = await getTranslations({ locale, namespace: "payee" });
  const when = new Intl.DateTimeFormat(locale === "fr" ? "fr-CI" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });
  const header = [t("csv.date"), t("csv.beneficiary"), t("csv.reference"), t("csv.amount"), t("csv.sender"), t("csv.status"), t("csv.confirmed")];
  const lines = (rows ?? []).map((r) => [
    when.format(new Date(r.created_at)),
    r.beneficiary_name,
    r.reference ?? "",
    formatMoney(r.amount, "XOF", locale),
    r.sender_first_name ?? "",
    t(`csv.statuses.${r.status}` as "csv.statuses.received"),
    r.confirmed_at ? when.format(new Date(r.confirmed_at)) : "",
  ]);
  const csv = "﻿" + [header, ...lines].map((l) => l.map(cell).join(";")).join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="paiements-recus.csv"`,
      "cache-control": "no-store",
    },
  });
}
