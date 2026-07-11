// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:8787',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 8787 --directory docs',
    port: 8787,
    reuseExistingServer: !process.env.CI,
  },
});
