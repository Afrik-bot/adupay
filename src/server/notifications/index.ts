import "server-only";
import { after } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { serverEnv } from "../env";
import { dispatchNotifications } from "./dispatch";
import { SimulatedNotificationProvider } from "./simulated";
import type { NotificationProvider } from "./types";

let provider: NotificationProvider | undefined;

/** The configured WhatsApp/SMS sender. Until a provider is signed this is the simulator. */
export function getNotificationProvider(): NotificationProvider {
  if (provider) return provider;
  const name = serverEnv.notificationProvider();
  if (name !== "simulated") throw new Error(`Unknown NOTIFICATION_PROVIDER "${name}"; only "simulated" exists so far`);
  provider = new SimulatedNotificationProvider();
  return provider;
}

/** Drains the queue in batches (capped so one run cannot loop forever). */
export async function sendQueuedNotifications(maxBatches = 20) {
  const total = { sent: 0, failed: 0 };
  for (let i = 0; i < maxBatches; i++) {
    const batch = await dispatchNotifications(adminDb(), getNotificationProvider());
    total.sent += batch.sent;
    total.failed += batch.failed;
    if (batch.sent + batch.failed === 0) break;
  }
  return total;
}

/** Sends whatever is queued once the response has gone out (the daily job catches the rest). */
export function sendNotificationsSoon() {
  after(() => sendQueuedNotifications().catch((error) => console.error("notification dispatch failed", error)));
}
