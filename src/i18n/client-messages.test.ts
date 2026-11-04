import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fr from "../../messages/fr.json";
import { CLIENT_NAMESPACES, pickClientMessages } from "./client-messages";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("client messages", () => {
  it("covers every namespace a client component translates", () => {
    const sent = pickClientMessages(fr);
    const has = (path: string) => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), sent) !== undefined;
    const src = join(__dirname, "..");
    const missing: string[] = [];
    for (const file of files(src)) {
      const code = readFileSync(file, "utf8");
      if (!code.includes('"use client"')) continue;
      for (const m of code.matchAll(/useTranslations\("([a-zA-Z.]+)"\)/g)) {
        const ns = m[1];
        // the component's keys live under ns; t("x") needs ns.x, so the namespace itself must be sent
        // (or, for notifications, the only key the client uses)
        if (!has(ns) && !(ns === "notifications" && has("notifications.markRead"))) missing.push(`${file}: ${ns}`);
      }
      expect(code, `${file} uses useTranslations() without a namespace`).not.toMatch(/useTranslations\(\)/);
    }
    expect(missing).toEqual([]);
  });

  it("leaves server-only copy out", () => {
    const sent = pickClientMessages(fr) as Record<string, Record<string, unknown>>;
    expect(sent.landing).toBeUndefined();
    expect(sent.legal).toBeUndefined();
    expect(sent.notifications).toEqual({ markRead: fr.notifications.markRead });
    expect(sent.admin.kpis).toBeUndefined();
    expect(JSON.stringify(sent).length).toBeLessThan(JSON.stringify(fr).length * 0.85);
  });

  it("every listed namespace exists", () => {
    const sent = JSON.stringify(pickClientMessages(fr));
    for (const ns of CLIENT_NAMESPACES) expect(sent, ns).toContain(`"${ns.split(".").pop()}"`);
  });
});
