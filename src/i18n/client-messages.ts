// Only the namespaces client components translate are sent to the browser; the
// rest (landing, legal, message templates, admin server pages...) stays on the
// server, which keeps every page's first load lighter on 3G.
// client-messages.test.ts fails if a client component uses a namespace missing here.
export const CLIENT_NAMESPACES = [
  "accounts",
  "admin.decision",
  "admin.fx",
  "admin.nav",
  "admin.risks",
  "auth",
  "kyc",
  "manager",
  "nav",
  "notifications.markRead",
  "offline",
  "onboarding",
  "payFor",
  "payee",
  "savings",
  "tontines",
  "ussdSim",
] as const;

type Messages = Record<string, unknown>;

export function pickClientMessages(messages: Messages, namespaces: readonly string[] = CLIENT_NAMESPACES): Messages {
  const out: Messages = {};
  for (const ns of namespaces) {
    const keys = ns.split(".");
    let source: unknown = messages;
    for (const k of keys) source = source && typeof source === "object" ? (source as Messages)[k] : undefined;
    if (source === undefined) continue;
    let target = out;
    keys.slice(0, -1).forEach((k) => (target = (target[k] ??= {}) as Messages));
    target[keys[keys.length - 1]] = source;
  }
  return out;
}
