import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import sharp from "sharp";
import fr from "../messages/fr.json";

/** UI copy, so tests follow the same words users read. */
export const copy = fr;

/** Runs a cron route like Vercel does (the secret is read from .env.local, never printed). */
export async function runCron(request: APIRequestContext, job: "tontines" | "reconcile") {
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  const secret = /^CRON_SECRET=(.*)$/m.exec(env)?.[1]?.trim();
  if (!secret) throw new Error("CRON_SECRET missing from .env.local");
  const response = await request.get(`/api/cron/${job}`, { headers: { authorization: `Bearer ${secret}` }, timeout: 180_000 });
  expect(response.ok()).toBe(true);
  return response.json();
}

/** A small real PNG for document uploads (the app compresses images client-side). */
export async function testImage(name: string) {
  const buffer = await sharp({ create: { width: 640, height: 400, channels: 3, background: "#d9d2c3" } }).png().toBuffer();
  return { name, mimeType: "image/png", buffer };
}

/**
 * Test users come from Supabase "Test Phone Numbers and OTPs" (no SMS sent).
 * Format: COUNTRY:NATIONAL_NUMBER:CODE, e.g. E2E_USER_A="CI:0700000099:123456".
 */
export interface TestUser {
  country: string;
  number: string;
  code: string;
}

export function testUser(name: "E2E_USER_A" | "E2E_USER_B"): TestUser | null {
  const raw = process.env[name];
  if (!raw) return null;
  const [country, number, code] = raw.split(":");
  return { country, number, code };
}

export async function signIn(page: Page, user: TestUser, next?: string) {
  await page.goto(next ? `/connexion?next=${encodeURIComponent(next)}` : "/connexion");
  await page.locator("#country").selectOption(user.country);
  await page.locator("#phone").fill(user.number);
  await page.getByRole("button", { name: "Recevoir le code" }).click();
  await page.locator("#code").fill(user.code);
  await page.getByRole("button", { name: "Valider" }).click();
  // A first sign-in also creates the account: give a slow dev server time.
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 240_000 });
  // The app sends a new user from the first page to onboarding a moment later, so
  // ask for onboarding directly: it shows the wizard, or redirects if already done.
  await page.goto("/bienvenue");
  if (new URL(page.url()).pathname === "/bienvenue") await completeOnboarding(page, next);
  else if (next && new URL(page.url()).pathname !== next) await page.goto(next);
}

async function completeOnboarding(page: Page, next?: string) {
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: /Je vis en Côte d’Ivoire/ }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.locator("#fullName").fill("Membre E2E");
  await page.locator("#city").fill("Abidjan");
  await page.getByRole("button", { name: "Terminer" }).click();
  // Onboarding returns to the link the user came from (an invite, the payee portal).
  await page.waitForURL(next ? (url) => url.pathname === next : /\/accueil$/, { timeout: 120_000 });
}

/**
 * Makes a Wave sandbox wallet the default. Linking always runs (a duplicate is
 * fine) because accounts linked before Phase 6 have no payment token.
 */
export async function ensureWallet(page: Page, number: string) {
  await page.goto("/profil/comptes");
  await page.getByRole("button", { name: "Wave", exact: true }).click();
  await page.locator("#accountNumber").fill(number);
  await page.getByRole("button", { name: "Vérifier et lier" }).click();
  await expect(page.getByText(/Compte vérifié et lié|déjà lié/)).toBeVisible({ timeout: 60_000 });
  await page.reload();
  const wave = page.locator("main ul li", { hasText: `•••• ${number.replace(/\D/g, "").slice(-4)}` });
  const makeDefault = wave.getByRole("button", { name: "Choisir par défaut" });
  if (await makeDefault.count()) {
    await makeDefault.click();
    await expect(wave.getByText("Par défaut")).toBeVisible({ timeout: 60_000 });
  }
}

/** The current 6-digit code for a base32 authenticator secret (RFC 6238, 30-second steps). */
export function totp(secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/[s=]/g, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/**
 * Opens an admin page. Staff need their authenticator code first: the secret is
 * E2E_USER_A_TOTP (the key shown when A set up two-factor sign-in, README).
 */
export async function openAdmin(page: Page, path: string) {
  await page.goto(path);
  if (new URL(page.url()).pathname !== "/securite-admin") return;
  const secret = process.env.E2E_USER_A_TOTP;
  if (!secret) throw new Error("A needs two-factor sign-in: set E2E_USER_A_TOTP to the authenticator key (README, End-to-end tests)");
  await page.locator("#mfaCode").fill(totp(secret));
  await page.getByRole("button", { name: copy.auth.mfa.verify }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/admin"), { timeout: 120_000 });
  if (new URL(page.url()).pathname + new URL(page.url()).search !== path) await page.goto(path);
}
