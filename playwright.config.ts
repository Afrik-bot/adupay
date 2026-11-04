import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // The journeys share one Supabase project and build on each other
  // (01 verifies B, 02 needs B verified), so files run one at a time, in name order.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  // Low-end Android phone at 360px, the main target.
  // Uses the installed Microsoft Edge (no browser download); set PW_CHANNEL=chromium on CI.
  projects: [
    {
      name: "mobile",
      use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 740 }, channel: process.env.PW_CHANNEL ?? "msedge" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/accueil",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
