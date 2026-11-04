import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminDb, createAdminClient } from "@/lib/supabase/admin";
import { getAirtimeProvider } from "@/server/airtime";
import { reconcileTopups } from "@/server/airtime/deliver";
import { serverEnv } from "@/server/env";
import { getPaymentProvider } from "@/server/payments";
import { reconcile } from "@/server/payments/reconcile";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  // Vercel Cron sends "Authorization: Bearer $CRON_SECRET".
  const expected = Buffer.from(`Bearer ${serverEnv.cronSecret()}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const report = await reconcile(adminDb(), getPaymentProvider());
  // Top-ups whose delivery webhook never arrived.
  const { data: stale } = await createAdminClient()
    .from("topups")
    .select("provider_ref")
    .eq("status", "pending")
    .not("provider_ref", "is", null)
    .lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(200);
  const topups = await reconcileTopups(adminDb(), getAirtimeProvider(), (stale ?? []) as { provider_ref: string }[]);
  return NextResponse.json({ ok: true, report, topups });
}
