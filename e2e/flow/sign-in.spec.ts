import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { flowApiUrl } from './env.ts'
import { admin, adminRole, tenants } from './tenants.ts'

/**
 * The REAL flow: a real browser, the real admin, the real API and a real database. The clients
 * were made by the real seed command (see start-api.mjs), so nothing here is a stand-in.
 */

const SESSION_KEY = 'cms-admin.session'
const SITE_KEY = 'cms-admin.site'
const siteNames = tenants.map((tenant) => tenant.site)

type RealMembership = { site: { id: string; name: string }; permissions: string[] }

/** Asks the real API directly, so what the screen shows can be compared with what the API says. */
async function realLogin(request: APIRequestContext) {
  const response = await request.post(`${flowApiUrl}/auth/login`, {
    data: { email: admin.email, password: admin.password },
  })
  expect(response.status()).toBe(200)
  return (await response.json()) as { accessToken: string; memberships: RealMembership[] }
}

async function signInThroughTheScreen(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email').fill(admin.email)
  await page.getByLabel('Password').fill(admin.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign out' })).toBeVisible()
}

const stored = (page: Page, key: string) =>
  page.evaluate((name) => localStorage.getItem(name), key)

const whoAmIRequest = (page: Page) =>
  page.waitForRequest((request) => new URL(request.url()).pathname === '/auth/me')

test('[UC-AS-01] signing in with a seeded account shows the person, the site, the role and what it allows', async ({
  page,
  request,
}) => {
  await signInThroughTheScreen(page)
  const real = await realLogin(request)

  const heading = page.locator('.welcome-panel h2')
  await expect(heading).toHaveText(new RegExp(`^(${siteNames.join('|')})$`))
  const shownSite = (await heading.textContent()) ?? ''
  const membership = real.memberships.find((m) => m.site.name === shownSite)

  expect(membership?.permissions.length).toBeGreaterThan(0)
  await expect(
    page.getByText(`Signed in as ${admin.name} (${admin.email}). Your role on this site: ${adminRole}.`),
  ).toBeVisible()
  await expect(page.getByRole('banner')).toContainText(admin.name)
  await expect(page.locator('main li')).toHaveCount(membership?.permissions.length ?? -1)

  // Only the token and its expiry are kept.
  const saved = JSON.parse((await stored(page, SESSION_KEY)) ?? 'null')
  expect(Object.keys(saved).sort()).toEqual(['accessToken', 'expiresAt'])
})

test('[UC-AS-02] a reload keeps the session and asks the API who it belongs to', async ({ page }) => {
  await signInThroughTheScreen(page)
  const siteBefore = (await page.locator('.welcome-panel h2').textContent()) ?? ''
  const saved = JSON.parse((await stored(page, SESSION_KEY)) ?? 'null') as { accessToken: string }

  const [whoAmI] = await Promise.all([whoAmIRequest(page), page.reload()])

  expect(whoAmI.headers().authorization).toBe(`Bearer ${saved.accessToken}`)
  await expect(page.getByRole('banner')).toContainText(admin.name)
  await expect(page.locator('.welcome-panel h2')).toHaveText(siteBefore)
})

test('[UC-AS-03] signing out returns to the sign-in screen, and a reload stays there', async ({
  page,
}) => {
  await signInThroughTheScreen(page)
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue('')
  await expect(page.getByRole('status')).toHaveCount(0)
  expect(await stored(page, SESSION_KEY)).toBeNull()
  expect(await stored(page, SITE_KEY)).toBeNull()

  const asked: string[] = []
  page.on('request', (request) => asked.push(new URL(request.url()).pathname))
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  expect(asked.filter((path) => path.startsWith('/auth/'))).toEqual([])
})

test('[UC-AS-04] with two sites the switcher lists both, switches, remembers the choice and sends it', async ({
  page,
  request,
}) => {
  await signInThroughTheScreen(page)
  const real = await realLogin(request)

  const switcher = page.getByLabel('Site')
  await expect(switcher.locator('option')).toHaveCount(2)
  for (const site of siteNames) {
    await expect(switcher.locator('option', { hasText: `${site} · ${adminRole}` })).toHaveCount(1)
  }

  const heading = page.locator('.welcome-panel h2')
  const shown = (await heading.textContent()) ?? ''
  const other = real.memberships.find((m) => m.site.name !== shown)
  expect(other).toBeDefined()
  await switcher.selectOption(other?.site.id ?? '')
  await expect(heading).toHaveText(other?.site.name ?? '')
  expect(await stored(page, SITE_KEY)).toBe(other?.site.id)

  // After a reload the same site is still the one being worked on, and the request says so.
  const [whoAmI] = await Promise.all([whoAmIRequest(page), page.reload()])
  expect(whoAmI.headers()['x-site-id']).toBe(other?.site.id)
  await expect(heading).toHaveText(other?.site.name ?? '')
})

test('[UC-AS-05] a wrong password and an unknown email get exactly the same message', async ({
  page,
}) => {
  await page.goto('/')
  const attempts = [
    { email: admin.email, password: 'definitely-the-wrong-password' },
    { email: 'nobody@orchard.test', password: admin.password },
  ]

  for (const attempt of attempts) {
    await page.getByLabel('Email').fill(attempt.email)
    await page.getByLabel('Password').fill(attempt.password)
    const [response] = await Promise.all([
      page.waitForResponse('**/auth/login'),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ])
    expect(response.status()).toBe(401)
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.')
    await expect(page.getByLabel('Email')).toHaveValue(attempt.email)
    await expect(page.getByLabel('Password')).toHaveValue('')
  }

  expect(await stored(page, SESSION_KEY)).toBeNull()
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
})

test('[UC-AS-15] signing out or in on one tab is followed by the other tabs', async ({
  page,
  context,
}) => {
  await signInThroughTheScreen(page)
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.getByRole('banner')).toContainText(admin.name)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(other.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()

  await page.getByLabel('Email').fill(admin.email)
  await page.getByLabel('Password').fill(admin.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(other.getByRole('banner')).toContainText(admin.name)
})
