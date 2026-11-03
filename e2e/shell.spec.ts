import { expect, test } from "@playwright/test";

test("landing page is in French by default and links into the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1, name: "Votre argent, votre communauté." })).toBeVisible();
  await page.getByRole("link", { name: "Ouvrir l’app de démo" }).click();
  await expect(page).toHaveURL(/\/accueil$/);
  await expect(page.getByRole("heading", { level: 1, name: "Accueil" })).toBeVisible();
});

test("landing page switches to English", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "en" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your money, your community." })).toBeVisible();
});

test("bottom navigation reaches every tab", async ({ page }) => {
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
});

test("switching to English on Profil persists", async ({ page }) => {
  await page.goto("/profil");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  await page.goto("/accueil");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
});

test("nav targets are at least 48px tall", async ({ page }) => {
  await page.goto("/accueil");
  for (const link of await page.getByRole("navigation").getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
});
