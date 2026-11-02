import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

/** Server-only configuration. Read lazily so a missing key fails the request, not the build. */
export const serverEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  sandboxWebhookSecret: () => required("SANDBOX_WEBHOOK_SECRET"),
  cronSecret: () => required("CRON_SECRET"),
  appUrl: () => process.env.APP_URL ?? "http://localhost:3000",
  paymentProvider: () => process.env.PAYMENT_PROVIDER ?? "sandbox",
};
