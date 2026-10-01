import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests run against Vite's dev server: it has no overlays unless the build is broken, and
 * it starts in about a second.
 *
 * Port: a devflow slot sets DEVFLOW_PORT_ADMIN. In the main checkout tests use 5190, not 5173, so
 * they never collide with a dev server you have running.
 */
const port = Number(process.env.DEVFLOW_PORT_ADMIN ?? 5190)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'e2e',
      testIgnore: 'visual/**',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Baselines are per-OS, so this project runs locally and in slots, not in CI.
      name: 'visual',
      testMatch: 'visual/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: baseURL,
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
