import type { NotificationProvider, OutboundMessage } from "./types";

/**
 * Sends nothing: the message is "delivered" and stays visible in the user's
 * notifications centre. Numbers ending in 9992 fail, like the payment sandbox,
 * so retry handling can be tested.
 */
export class SimulatedNotificationProvider implements NotificationProvider {
  readonly name = "simulated";
  readonly outbox: OutboundMessage[] = [];

  async send(message: OutboundMessage) {
    if (message.to.endsWith("9992")) throw new Error("simulated_delivery_failure");
    this.outbox.push(message);
    return { providerRef: `sim_${message.channel}_${message.id.slice(0, 8)}` };
  }
}
