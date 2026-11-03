import { expect, test } from "@playwright/test";
import { ensureWallet, signIn, testUser } from "./support";

// Runs against the configured Supabase project with two test phone numbers.
// User A must be KYC tier 1+ to pay (see README, "End-to-end tests").
const A = testUser("E2E_USER_A");
const B = testUser("E2E_USER_B");

test.describe.configure({ mode: "serial", timeout: 300_000 });
test.skip(!A || !B, "Set E2E_USER_A and E2E_USER_B to run the tontine journey");

let groupUrl = "";
let inviteCode = "";

test("create a tontine with the 4-step wizard", async ({ page }) => {
  await signIn(page, A!);
  await page.goto("/tontines/nouvelle");

  await page.locator("#name").fill(`E2E ${Date.now()}`);
  await page.locator("#amount").fill("5 000");
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByRole("button", { name: "Hebdomadaire" }).click();
  await page.locator("#memberLimit").fill("5");
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByRole("button", { name: /Ordre fixe/ }).click();
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.locator("#graceDays").fill("3");
  await page.locator("#penalty").fill("250");
  await page.getByRole("button", { name: "Voir le résumé" }).click();

  // Plain-language summary before saving.
  await expect(page.getByText(/jusqu’à 5 membres versent chacun 5 000 FCFA/)).toBeVisible();
  await expect(page.getByText(/pénalité de 250 FCFA/)).toBeVisible();
  await page.getByRole("button", { name: "Créer la tontine" }).click();

  await page.waitForURL(/\/tontines\/[0-9a-f-]{36}/, { timeout: 120_000 });
  await expect(page.getByText("Tontine créée.", { exact: false })).toBeVisible();
  const whatsapp = page.getByRole("link", { name: "Partager sur WhatsApp" });
  await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*rejoindre/);
  groupUrl = new URL(page.url()).pathname;
  inviteCode = (await page.getByText(/^Code : /).textContent())!.replace("Code : ", "").trim();
  expect(inviteCode).toMatch(/^[0-9a-f]{12}$/);
});

test("a second member joins through the invite link", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Opening the invite first sends them to sign-in and back.
  await page.goto(`/rejoindre/${inviteCode}`);
  await expect(page).toHaveURL(/\/connexion\?next=/);
  await signIn(page, B!, `/rejoindre/${inviteCode}`);
  await expect(page.getByRole("button", { name: "Rejoindre la tontine" })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Rejoindre la tontine" }).click();
  await page.waitForURL(new RegExp(groupUrl), { timeout: 120_000 });
  await expect(page.getByText("2 sur 5 membres")).toBeVisible();
  await context.close();
});

test("the manager starts it and pays their share, with a receipt", async ({ page }) => {
  await signIn(page, A!);
  await ensureWallet(page, "07 00 00 99 90"); // sandbox: …9990 always succeeds
  await page.goto(groupUrl);
  await page.getByRole("button", { name: "Démarrer la tontine" }).click();
  await expect(page.getByText(/Tour 1 sur 2/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("0 sur 2 ont payé")).toBeVisible();

  await page.getByRole("button", { name: /Payer ma part/ }).click();
  await page.waitForURL(/\/recu\//, { timeout: 120_000 });
  await expect(page.getByText("5 000 FCFA").first()).toBeVisible();
  // The sandbox confirms within 1-5 s through the signed webhook; the receipt refreshes itself.
  await expect(page.getByRole("heading", { name: "Paiement réussi" })).toBeVisible({ timeout: 90_000 });

  await page.goto(groupUrl);
  await expect(page.getByText("1 sur 2 ont payé")).toBeVisible();
  await expect(page.getByText("Vous avez payé votre part pour ce tour.")).toBeVisible();
  await expect(page.getByText(/Cotisation de .* · tour 1/)).toBeVisible();
});
