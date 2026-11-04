import type { PaymentStatus } from "../payments/types";

export type AirtimeOperator = "orange" | "mtn" | "moov";

export interface AirtimeProduct {
  /** The distributor's product id (airtime_products.provider_product_id). */
  id: string;
  operator: AirtimeOperator;
  type: "airtime" | "data";
  label: string;
  dataMb: number | null;
  priceXof: number;
  validityDays: number | null;
}

export interface AirtimePurchase {
  /** 225 + 10 digits. */
  msisdn: string;
  productId: string;
  /** The distributor dedupes on it: the same key never delivers twice. */
  idempotencyKey: string;
}

export interface AirtimeResult {
  providerRef: string;
  status: PaymentStatus;
  failureCode?: string;
}

export interface AirtimeWebhookEvent extends AirtimeResult {
  eventId: string;
}

/**
 * Every airtime/data distributor sits behind this interface. A licensed
 * distributor later means one new class here, chosen with AIRTIME_PROVIDER.
 */
export interface AirtimeProvider {
  readonly name: string;
  listProducts(operator: AirtimeOperator): Promise<AirtimeProduct[]>;
  purchase(request: AirtimePurchase): Promise<AirtimeResult>;
  getStatus(providerRef: string): Promise<Omit<AirtimeResult, "providerRef">>;
  /** Verifies the signature and parses the body. Throws InvalidWebhookError. */
  handleWebhook(rawBody: string, headers: Headers): Promise<AirtimeWebhookEvent>;
}
