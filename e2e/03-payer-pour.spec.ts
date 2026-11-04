import { expect, test } from "@playwright/test";
import { copy, openAdmin, signIn, testImage, testUser } from "./support";

// Journey 2: a diaspora sender pays a verified school directly; the school
// confirms receipt. B registers the school (once), A approves it as admin, then pays it.
const A = testUser("E2E_USER_A");
const B = testUser("E2E_USER_B");

test.describe.configure({ mode: "serial", timeout: 300_000 });
test.skip(!A || !B, "Set E2E_USER_A (admin) and E2E_USER_B to run the Payer pour journey");

let schoolName = "";
let paymentUrl = "";

test("a school registers as a payee and an admin verifies it", async ({ page, browser }) => {
  const school = await browser.newPage();
  await signIn(school, B!);
  await school.goto("/payee");
  const registering = await school.locator("#bizName").count();
  if (registering) {
    schoolName = `École E2E ${Date.now()}`;
    await school.locator("#bizName").fill(schoolName);
    await school.locator("#rccm").fill(`CI-ABJ-2026-B-${String(Date.now()).slice(-5)}`);
    await school.locator("#category").selectOption("school");
    await school.locator("#bizCity").fill("Abidjan");
    await school.locator("#bizAddress").fill("Cocody, Riviera 2");
    await school.locator("#contact").fill("07 00 00 00 01");
    await school.getByRole("button", { name: "Wave", exact: true }).click();
    await school.locator("#payoutNumber").fill("01 00 00 99 90"); // sandbox: …9990 always succeeds
    await school.locator("#rccmDoc").setInputFiles(await testImage("rccm.png"));
    await school.locator("#idDoc").setInputFiles(await testImage("gerant.png"));
    await school.getByRole("button", { name: copy.payee.register.submit }).click();
    await expect(school.getByText(copy.payee.pending)).toBeVisible({ timeout: 120_000 });
  }
  schoolName ||= (await school.getByRole("heading", { level: 1 }).textContent())!.trim();
  const pending = await school.getByText(copy.payee.pending).count();
  await school.close();

  if (pending) {
    await signIn(page, A!);
    await openAdmin(page, "/admin/kyb");
    const card = page.locator("main > div > *").filter({ hasText: schoolName }).first();
    await card.getByRole("button", { name: copy.admin.decision.approve }).click();
    await expect(card).toBeHidden({ timeout: 60_000 });
  }
});

test("a sender pays the school by card and follows it", async ({ page }) => {
  await signIn(page, A!);
  await page.goto("/payer-pour/nouveau");
  await page.getByRole("button", { name: new RegExp(copy.payFor.purposes.school) }).click();
  await page.getByRole("button", { name: copy.payFor.next }).click();
  await page.locator("#search").fill(schoolName.slice(0, 20));
  await page.getByRole("button", { name: new RegExp(schoolName) }).click();
  await page.getByRole("button", { name: copy.payFor.next }).click();
  await page.locator("#beneficiary").fill("Fatou Traoré");
  await page.locator("#reference").fill("CM2 B");
  await page.locator("#amount").fill("50000");
  await page.getByRole("button", { name: copy.payFor.next }).click();
  await page.getByRole("button", { name: "EUR", exact: true }).click();
  await page.getByRole("button", { name: copy.payFor.toPayment }).click({ timeout: 60_000 });
  await page.locator("#cardNumber").fill("4242 4242 4242 4242"); // sandbox: always accepted
  await page.locator("#expiry").fill("12/30");
  await page.locator("#cvc").fill("123");
  await page.getByRole("button", { name: /^Payer / }).click();
  await page.waitForURL(/\/payer-pour\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  paymentUrl = new URL(page.url()).pathname;
  // Card clears, then the payout reaches the school's wallet.
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(copy.payFor.timeline.receivedHint)).toBeHidden({ timeout: 3_000 });
  }).toPass({ timeout: 120_000 });
});

test("the school confirms receipt and the sender sees it", async ({ page, browser }) => {
  const school = await browser.newPage();
  await signIn(school, B!);
  await school.goto("/payee");
  const row = school.locator("li").filter({ hasText: "Fatou Traoré" }).filter({ has: school.getByRole("button", { name: copy.payee.confirm }) }).first();
  await row.getByRole("button", { name: copy.payee.confirm }).click();
  await school.goto("/payee?statut=confirmed");
  await expect(school.getByText(/Réception confirmée le/).first()).toBeVisible({ timeout: 60_000 });
  await school.close();

  await signIn(page, A!);
  await page.goto(paymentUrl);
  await expect(page.getByText(copy.payFor.timeline.confirmedHint)).toBeHidden({ timeout: 60_000 });
  await page.goto("/notifications");
  await expect(page.getByText(/confirme avoir reçu/).first()).toBeVisible();
});
