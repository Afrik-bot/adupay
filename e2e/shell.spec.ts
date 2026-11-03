import { expect, test } from "@playwright/test";
import { signIn, testUser } from "./support";

test("landing page is in French by default and switches to English", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1, name: "Votre argent, votre communauté." })).toBeVisible();
  await page.getByRole("button", { name: "en" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your money, your community." })).toBeVisible();
  await page.getByRole("button", { name: "fr" }).click();
});

test("app pages send signed-out visitors to sign-in", async ({ page }) => {
  await page.goto("/accueil");
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
});

test.describe("signed in", () => {
  const user = testUser("E2E_USER_A");
  test.skip(!user, "Set E2E_USER_A to run signed-in tests");

  test("bottom navigation reaches every tab with 48px targets", async ({ page }) => {
    await signIn(page, user!);
    await page.goto("/accueil");
    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    for (const [label, path] of [
      ["Tontines", "/tontines"],
      ["Payer pour", "/payer-pour"],
      ["Épargne", "/epargne"],
      ["Profil", "/profil"],
      ["Accueil", "/accueil"],
    ]) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }
    for (const link of await nav.getByRole("link").all()) {
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(48);
    }
  });
});
