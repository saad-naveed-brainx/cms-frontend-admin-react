import type { Page, Route } from '@playwright/test'

/**
 * Helpers for the tests that do NOT use the real API: they answer the API's calls themselves, for
 * states the real one cannot be made to produce on demand (server down, a 500, a slow answer, an
 * account with no sites) and for screenshots that must look the same every time. The real flow is
 * in e2e/flow/. The shapes below mirror api/src/auth/auth.service.ts.
 */

export const SESSION_KEY = 'cms-admin.session'
export const SITE_KEY = 'cms-admin.site'

export const person = {
  id: '0198f2a0-0000-7000-8000-0000000000f1',
  email: 'olivia@orchard.test',
  name: 'Olivia Orchard',
}

export const orchard = {
  site: { id: '0198f2a0-0000-7000-8000-000000000001', name: 'Orchard Bakery' },
  role: { id: '0198f2a0-0000-7000-8000-0000000000a1', name: 'Administrator' },
  permissions: ['content.read', 'content.write', 'members.manage'],
}

export const maple = {
  site: { id: '0198f2a0-0000-7000-8000-000000000002', name: 'Maple Books' },
  role: { id: '0198f2a0-0000-7000-8000-0000000000a2', name: 'Editor' },
  permissions: ['content.read', 'content.write'],
}

export const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString()

export const profileBody = (memberships = [orchard, maple]) => ({ user: person, memberships })

export const loginBody = (memberships = [orchard, maple]) => ({
  accessToken: 'mock-access-token',
  tokenType: 'Bearer',
  expiresAt: inDays(7),
  ...profileBody(memberships),
})

/** Answers a call with a status and a body. The API is another origin, so the answer says it may be read. */
export function fulfill(route: Route, status: number, body: unknown, contentType = 'application/json') {
  return route.fulfill({
    status,
    contentType,
    headers: { 'access-control-allow-origin': '*' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** Every call the page makes to the API's /auth/ routes, in order. */
export function authCalls(page: Page) {
  const calls: { method: string; path: string; headers: Record<string, string> }[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/auth/')) {
      calls.push({ method: request.method(), path: pathname, headers: request.headers() })
    }
  })
  return calls
}

export const readStorage = (page: Page, key: string) =>
  page.evaluate((name) => localStorage.getItem(name), key)

/** Puts values in the browser's storage and reloads, so the app starts with them in place. */
export async function seedStorage(page: Page, entries: Record<string, string>) {
  await page.goto('/')
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value)
  }, entries)
  await page.reload()
}
