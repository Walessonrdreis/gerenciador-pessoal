import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
  webServer: {
    command: 'npx cross-env PORT=3100 npm run dev',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'secret-e2e-nao-usar-em-prod-1234567890',
    },
  },
});
