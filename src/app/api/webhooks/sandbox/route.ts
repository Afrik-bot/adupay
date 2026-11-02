import { NextResponse } from "next/server";
import { getPaymentService } from "@/server/payments";
import { InvalidWebhookError } from "@/server/payments/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // The signature covers the exact bytes, so read the raw body before parsing.
  const rawBody = await request.text();
  try {
    const payment = await getPaymentService().handleWebhook(rawBody, request.headers);
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
