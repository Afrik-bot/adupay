import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  // Low-end Android phone at 360px, the main target.
  projects: [{ name: "mobile", use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 740 } } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/accueil",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
