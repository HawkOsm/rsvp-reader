import { defineConfig, devices } from '@playwright/test'

// The smoke test from CONTRIBUTING.md, automated: it drives the production
// build (`vite preview`), so it checks what actually ships. Run `pnpm build`
// first; `pnpm e2e` does both.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // A cached app shell from a previous run must not stand in for this build.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'short-window',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 420 } },
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Vite directly, not through pnpm, so stopping it actually stops it.
    command: 'node node_modules/vite/bin/vite.js preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
