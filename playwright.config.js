const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: Boolean(process.env.CI),
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      // retraso de 1 segundo entre acciones para observar la ejecucion
      slowMo: 1000,
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    // las pruebas E2E no dependen de Auth0: el gate de login se prueba aparte
    env: { PORT: '3100', AUTH_REQUIRED: 'false' },
  },
});
