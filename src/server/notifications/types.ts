import type { Locale } from "@/lib/money";

export type DeliveryChannel = "whatsapp" | "sms";

export interface OutboundMessage {
  /** The notifications row id; providers use it to make retries idempotent. */
  id: string;
  /** E.164 digits, e.g. 2250700000099. */
  to: string;
  channel: DeliveryChannel;
  template: string;
  locale: Locale;
  text: string;
}

/**
 * Every WhatsApp/SMS sender sits behind this interface, like PaymentProvider for money.
 * Adding a real provider (WhatsApp Business API, Africa's Talking SMS) means one new
 * class here, chosen with NOTIFICATION_PROVIDER.
 */
export interface NotificationProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<{ providerRef: string }>;
}
