import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
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
  return NextResponse.json({ ok: true, report });
}
