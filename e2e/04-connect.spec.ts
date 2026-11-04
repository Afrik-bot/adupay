import { expect, test, type Page } from "@playwright/test";
import { copy, signIn, testUser } from "./support";

// AduPay Connect: data for a relative paid from the wallet, and a diaspora card top-up.
// Beneficiary numbers end in 9990: the sandbox distributor always delivers to them.
const A = testUser("E2E_USER_A");
const B = testUser("E2E_USER_B");

test.describe.configure({ mode: "serial", timeout: 300_000 });

async function delivered(page: Page) {
  await page.waitForURL(/\/credit\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  // The receipt refreshes itself until the network confirms.
  await expect(page.getByText(copy.credit.receipt.timeline.deliveredWaiting)).toBeHidden({ timeout: 120_000 });
}

test("a resident buys a data bundle for a relative from their wallet", async ({ page }) => {
  test.skip(!A, "Set E2E_USER_A to run the top-up journey");
  await signIn(page, A!);
  await page.goto("/accueil");
  await page.getByRole("link", { name: copy.home.actions.credit }).click();
  await page.getByRole("button", { name: new RegExp(copy.credit.who.other) }).click();
  await page.locator("#topupNumber").fill("07 11 22 99 90");
  await page.locator("#topupName").fill("Maman");
  // Suggested from the 07 prefix.
  await expect(page.getByRole("button", { name: copy.credit.operators.orange, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: copy.credit.next }).click();
  await page.getByRole("button", { name: /500 Mo/ }).click();
  await page.getByRole("button", { name: copy.credit.next }).click();
  await expect(page.getByText(copy.credit.review.feeValue, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Mobile Money/ }).click();
  // Offered only while the number is not a favourite yet.
  const save = page.getByLabel(copy.credit.review.save);
  if (await save.count()) await save.check();
  await page.getByRole("button", { name: /^Payer / }).click();
  await delivered(page);
  await expect(page.getByText(/Pass 500 Mo/).first()).toBeVisible();

  // "Répéter" starts again from the review with the same number and bundle.
  await page.getByRole("link", { name: copy.credit.receipt.repeat }).click();
  await expect(page.getByRole("heading", { name: copy.credit.review.title })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Maman").first()).toBeVisible();
});

test("a diaspora sender tops up a relative by card in EUR", async ({ page }) => {
  test.skip(!B, "Set E2E_USER_B to run the card top-up journey");
  await signIn(page, B!);
  await page.goto("/profil");
  await page.getByRole("button", { name: copy.onboarding.type.diaspora }).click();
  await expect(page.getByRole("button", { name: copy.onboarding.type.diaspora })).toHaveAttribute("aria-pressed", "true");
  try {
    await page.goto("/credit?pour=proche");
    await page.locator("#topupNumber").fill("05 22 33 99 90");
    await expect(page.getByRole("button", { name: copy.credit.operators.mtn, exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: copy.credit.next }).click();
    await page.getByRole("button", { name: copy.credit.choose.airtime }).click();
    await page.getByRole("button", { name: /Crédit 2 000 FCFA/ }).click();
    await page.getByRole("button", { name: copy.credit.next }).click();
    await page.getByRole("button", { name: copy.credit.review.card }).click();
    await page.getByRole("button", { name: "EUR", exact: true }).click();
    await expect(page.getByText(/€/).first()).toBeVisible({ timeout: 60_000 });
    await page.locator("#cardNumber").fill("4242 4242 4242 4242"); // sandbox: always accepted
    await page.locator("#expiry").fill("12/30");
    await page.locator("#cvc").fill("123");
    await page.getByRole("button", { name: /^Payer .*€/ }).click();
    await delivered(page);
    await expect(page.getByText(new RegExp(copy.credit.review.charged)).first()).toBeVisible();
  } finally {
    await page.goto("/profil");
    await page.getByRole("button", { name: copy.onboarding.type.resident }).click();
  }
});
