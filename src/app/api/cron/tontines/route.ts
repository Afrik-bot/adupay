import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { serverEnv } from "@/server/env";
import { getPaymentService } from "@/server/payments";
import { runTontineEngine } from "@/server/tontine-engine";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const expected = Buffer.from(`Bearer ${serverEnv.cronSecret()}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Daily tontine job (Vercel Cron). `?date=YYYY-MM-DD` simulates another day in development. */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const requested = new URL(request.url).searchParams.get("date");
  const today =
    requested && process.env.NODE_ENV !== "production" && /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? requested
      : new Date().toISOString().slice(0, 10); // Abidjan is UTC
  const report = await runTontineEngine(adminDb(), getPaymentService(), today);
  return NextResponse.json({ ok: report.errors.length === 0, today, report });
}
