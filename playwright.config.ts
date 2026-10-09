import { defineConfig, devices } from '@playwright/test'
import { adminPort, flowApiPort, flowApiUrl, flowDatabase } from './e2e/flow/env.ts'
import { admin, people, tenants } from './e2e/flow/tenants.ts'

/**
 * Browser tests run against Vite's dev server: it has no overlays unless the build is broken, and
 * it starts in about a second.
 *
 * Port: a devflow slot sets DEVFLOW_PORT_ADMIN. In the main checkout tests use 5190, not 5173, so
 * they never collide with a dev server you have running.
 *
 * Projects:
 * - e2e:    no API needed; the API's answers are replaced where a test needs a state the real API
 *           cannot produce on demand (server down, a 500). This is what GitHub CI runs.
 * - flow:   the REAL flow. Needs the api repo next to this one (../api): its server is started on
 *           its own port and database, with clients made by the real seed command (FLOW=1).
 * - visual: screenshots against approved baselines (macOS only, so not in CI).
 */
const baseURL = `http://127.0.0.1:${adminPort}`
const realApi = process.env.FLOW === '1'

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
      testIgnore: ['visual/**', 'flow/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'flow',
      testMatch: 'flow/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Baselines are per-OS, so this project runs locally and in slots, not in CI.
      name: 'visual',
      testMatch: 'visual/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1',
      url: baseURL,
      // The admin always points at the flow API's address; tests that do not use the real API
      // answer its calls themselves.
      env: { PORT: String(adminPort), VITE_API_URL: flowApiUrl },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    ...(realApi
      ? [
          {
            command: 'node e2e/flow/start-api.mjs',
            url: `${flowApiUrl}/health`,
            env: {
              FLOW_DATABASE: flowDatabase,
              FLOW_API_PORT: String(flowApiPort),
              FLOW_ADMIN_ORIGIN: baseURL,
              FLOW_ADMIN: JSON.stringify(admin),
              FLOW_TENANTS: JSON.stringify(tenants),
              FLOW_PEOPLE: JSON.stringify(people),
            },
            reuseExistingServer: false,
            // Build, migrate, create the clients, start: about half a minute.
            timeout: 180_000,
          },
        ]
      : []),
  ],
})
