import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { getAirtimeProvider } from "@/server/airtime";
import { sendNotificationsSoon } from "@/server/notifications";
import { InvalidWebhookError } from "@/server/payments/types";

export const runtime = "nodejs";

/** Delivery results from the airtime distributor (signed). */
export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const event = await getAirtimeProvider().handleWebhook(rawBody, request.headers);
    await adminDb().rpc("complete_topup", { p_provider_ref: event.providerRef, p_status: event.status, p_failure_code: event.failureCode ?? null });
    // "Bravo ! Vous avez gagné 500 Mo…" and delivery receipts go out after the response.
    sendNotificationsSoon();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvalidWebhookError) return NextResponse.json({ ok: false }, { status: 401 });
    console.error("airtime webhook failed", error);
    // 500 asks the distributor to retry; completing a top-up is idempotent.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
