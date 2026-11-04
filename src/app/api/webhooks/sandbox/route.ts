import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { deliverDirectedPayments } from "@/server/directed-payments";
import { sendTopupsSoon } from "@/server/airtime";
import { sendNotificationsSoon } from "@/server/notifications";
import { getPaymentService } from "@/server/payments";
import { InvalidWebhookError } from "@/server/payments/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // The signature covers the exact bytes, so read the raw body before parsing.
  const rawBody = await request.text();
  try {
    const service = getPaymentService();
    const payment = await service.handleWebhook(rawBody, request.headers);
    // A Payer pour card payment just cleared: send it on to the payee straight away
    // (the daily job retries anything this misses).
    if (payment.purpose_type === "directed_payment" && payment.status === "succeeded") {
      await deliverDirectedPayments(adminDb(), service).catch((error) => console.error("directed delivery failed", error));
    }
    // "Contribution received", "Payer pour delivered"... go out after the response.
    sendNotificationsSoon();
    // A paid top-up, or a Data offerte reward granted by an on-time share, is delivered next.
    sendTopupsSoon();
    return NextResponse.json({ ok: true, status: payment.status });
  } catch (error) {
    if (error instanceof InvalidWebhookError) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    console.error("sandbox webhook failed", error);
    // 500 tells the rail to retry; settlement is idempotent.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
