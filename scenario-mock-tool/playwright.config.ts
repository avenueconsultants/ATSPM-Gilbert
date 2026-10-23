import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', timeout: 90000, workers: 1,
  use: { baseURL: process.env.SCENARIO_TOOL_URL ?? 'http://localhost:3081', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3081', reuseExistingServer: !process.env.CI, timeout: 120000 },
})
