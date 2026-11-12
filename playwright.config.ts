import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: { headless: true, screenshot: "only-on-failure" },
  projects: [
    {
      name: "demo",
      testIgnore: "**/participant.spec.ts",
      use: { baseURL: "http://localhost:5174" },
    },
    {
      name: "production-api",
      testMatch: "**/participant.spec.ts",
      use: { baseURL: "http://localhost:5175" },
    },
  ],
  webServer: [
    {
      command: "npm run dev -- --port 5174 --strictPort",
      url: "http://localhost:5174",
      env: { VITE_DEMO_MODE: "true" },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5175 --strictPort",
      url: "http://localhost:5175",
      env: { VITE_DEMO_MODE: "false" },
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
