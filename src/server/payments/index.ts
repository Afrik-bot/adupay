import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { serverEnv } from "../env";
import { SandboxProvider } from "./sandbox";
import { PaymentService } from "./service";
import type { PaymentProvider } from "./types";

let provider: PaymentProvider | undefined;

/** The configured rail. Until partners are signed this is always the sandbox. */
export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;
  const name = serverEnv.paymentProvider();
  if (name !== "sandbox") throw new Error(`Unknown PAYMENT_PROVIDER "${name}"; only "sandbox" exists so far`);
  provider = new SandboxProvider({
    secret: serverEnv.sandboxWebhookSecret(),
    webhookUrl: new URL("/api/webhooks/sandbox", serverEnv.appUrl()).toString(),
  });
  return provider;
}

export function getPaymentService(): PaymentService {
  return new PaymentService(adminDb(), getPaymentProvider());
}
