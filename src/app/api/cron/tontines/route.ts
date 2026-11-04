import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { serverEnv } from "@/server/env";
import { getPaymentService } from "@/server/payments";
import { deliverDirectedPayments, runSchedules } from "@/server/directed-payments";
import { runSavingsTopups } from "@/server/savings";
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
  const db = adminDb();
  const service = getPaymentService();
  // Recurring Payer pour first: a scheduled tontine share lands before the round is judged.
  const schedules = await runSchedules(db, service, today);
  const savings = await runSavingsTopups(db, service, today);
  const report = await runTontineEngine(db, service, today);
  const delivered = await deliverDirectedPayments(db, service);
  return NextResponse.json({ ok: report.errors.length === 0, today, report, schedules, savings, delivered });
}
