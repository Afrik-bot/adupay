import { describe, expect, it } from "vitest";
import { buildCsp, cspNonce } from "./csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `));

describe("Content-Security-Policy", () => {
  it("only runs scripts that carry this request's nonce", () => {
    const csp = buildCsp("abc123", { supabaseUrl: "https://ref.supabase.co" });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("lets the app talk to Supabase and show its images", () => {
    const csp = buildCsp("n", { supabaseUrl: "https://ref.supabase.co" });
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://ref.supabase.co wss://ref.supabase.co");
    expect(directive(csp, "img-src")).toContain("https://ref.supabase.co");
  });

  it("allows eval and hot-reload sockets in development only", () => {
    const csp = buildCsp("n", { dev: true });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).toContain("ws:");
  });

  it("makes a new random nonce each time", () => {
    const a = cspNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(cspNonce()).not.toBe(a);
  });
});
