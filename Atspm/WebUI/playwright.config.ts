import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: process.env.TMC_E2E_URL ?? 'https://localhost:3443',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
})
