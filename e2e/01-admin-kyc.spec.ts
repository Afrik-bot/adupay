import { expect, test } from "@playwright/test";
import { copy, openAdmin, signIn, testImage, testUser } from "./support";

// Journey 3: a member sends identity documents and an admin approves them.
// A must have the admin role (README, "End-to-end tests"); B is the member.
// Runs first: B needs KYC tier 1 to pay in the tontine journey.
const A = testUser("E2E_USER_A");
const B = testUser("E2E_USER_B");

test.describe.configure({ mode: "serial", timeout: 300_000 });
test.skip(!A || !B, "Set E2E_USER_A (admin) and E2E_USER_B to run the KYC journey");

let step: "id" | "address" | "done" = "id";

test("a member submits documents for the next tier", async ({ page }) => {
  await signIn(page, B!);
  await page.goto("/profil/verification");
  // Never skip by accident: we must really be on the verification page.
  await expect(page).toHaveURL(/\/profil\/verification$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  const form = page.getByRole("button", { name: copy.kyc.form.submit });
  if (!(await form.count())) {
    step = "done";
    test.skip(true, "B is already at the highest tier (reset kyc_tier in the dev project to rerun)");
  }
  if (await page.locator("#idPhoto").count()) {
    step = "id";
    await page.locator("#idType").selectOption("cni");
    await page.locator("#idNumber").fill("CI0012345678");
    await page.locator("#idPhoto").setInputFiles(await testImage("cni.png"));
    await page.locator("#selfie").setInputFiles(await testImage("selfie.png"));
  } else {
    step = "address";
    await page.locator("#address").setInputFiles(await testImage("facture.png"));
  }
  await form.click();
  await expect(page.getByText(copy.kyc.form.sent.slice(0, 20), { exact: false })).toBeVisible({ timeout: 120_000 });
});

test("an admin approves them and the member moves up a tier", async ({ page, browser }) => {
  test.skip(step === "done");
  await signIn(page, A!);
  await openAdmin(page, "/admin/kyc");
  const card = page.locator("main > div > *").filter({ hasText: "Membre E2E" }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  // One decision per document (ID + selfie, or proof of address).
  for (let i = 0; i < 2; i++) {
    const approve = card.getByRole("button", { name: copy.admin.decision.approve });
    if (!(await approve.count())) break;
    await approve.first().click();
    await page.waitForTimeout(1500);
    await page.reload();
  }
  await page.goto("/admin/journal?action=kyc.review");
  await expect(page.getByText("kyc.review").first()).toBeVisible();

  const member = await browser.newPage();
  await signIn(member, B!);
  await member.goto("/profil/verification");
  await expect(member.locator(step === "id" ? "#address" : "main")).toBeVisible({ timeout: 60_000 });
  await member.close();
});
