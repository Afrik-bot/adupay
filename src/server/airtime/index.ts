import "server-only";
import { after } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { serverEnv } from "../env";
import { deliverTopups } from "./deliver";
import { SandboxAirtimeProvider } from "./sandbox";
import type { AirtimeProvider } from "./types";

let provider: AirtimeProvider | undefined;

/** The configured airtime distributor. Until one is signed this is always the sandbox. */
export function getAirtimeProvider(): AirtimeProvider {
  if (provider) return provider;
  const name = serverEnv.airtimeProvider();
  if (name !== "sandbox") throw new Error(`Unknown AIRTIME_PROVIDER "${name}"; only "sandbox" exists so far`);
  provider = new SandboxAirtimeProvider({
    secret: serverEnv.sandboxWebhookSecret(),
    webhookUrl: new URL("/api/webhooks/airtime", serverEnv.appUrl()).toString(),
  });
  return provider;
}

/** Drains the delivery queue in batches (capped). */
export async function sendQueuedTopups(maxBatches = 10) {
  const total = { sent: 0, failed: 0 };
  for (let i = 0; i < maxBatches; i++) {
    const batch = await deliverTopups(adminDb(), getAirtimeProvider());
    total.sent += batch.sent;
    total.failed += batch.failed;
    if (batch.sent + batch.failed === 0) break;
  }
  return total;
}

/** Delivers whatever is queued once the response has gone out (the daily job catches the rest). */
export function sendTopupsSoon() {
  after(() => sendQueuedTopups().catch((error) => console.error("top-up delivery failed", error)));
}
