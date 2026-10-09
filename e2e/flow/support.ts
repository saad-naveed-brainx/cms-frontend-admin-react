import { expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { flowApiUrl, flowDatabase } from './env.ts'
import { admin } from './tenants.ts'

type Person = { email: string; password: string }

/** A short lower-case token, so a test's pages never clash with another test's in the shared database. */
export const unique = (): string => Math.random().toString(36).slice(2, 8)

/** Signs in through the real sign-in screen and waits for the signed-in frame. */
export async function signInThroughTheScreen(page: Page, person: Person = admin) {
  await page.goto('/')
  await page.getByLabel('Email').fill(person.email)
  await page.getByLabel('Password').fill(person.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign out' })).toBeVisible()
}

/** Picks the site in the Site control, when the person has several. */
export async function openSite(page: Page, siteId: string) {
  const switcher = page.getByLabel('Site')
  if ((await switcher.count()) > 0) {
    await switcher.selectOption(siteId)
    await expect(switcher).toHaveValue(siteId)
  }
}

/**
 * SQL straight to the flow database, for the few things the API cannot do on purpose (a rich-text
 * block from before the API refused them) or cannot do yet.
 */
export function sql(statement: string): void {
  execFileSync('psql', [
    `postgresql://localhost:5432/${flowDatabase}`,
    '-v',
    'ON_ERROR_STOP=1',
    '-q',
    '-c',
    statement,
  ])
}

/** What a visitor's website is told about a site's page: the real public route, with no sign-in. */
export async function publicPage(request: APIRequestContext, host: string, path = '/') {
  const query = new URLSearchParams({ host, path })
  const response = await request.get(`${flowApiUrl}/public/site?${query}`)
  return { status: response.status(), body: await response.json() }
}

/**
 * The real API, called directly (not through the screen) as a signed-in person on one site, so a
 * test can make the pages it needs and check what the screen did.
 */
export async function realApi(request: APIRequestContext, person: Person, siteName: string) {
  const login = await request.post(`${flowApiUrl}/auth/login`, {
    data: { email: person.email, password: person.password },
  })
  expect(login.status()).toBe(200)
  const body = (await login.json()) as {
    accessToken: string
    memberships: { site: { id: string; name: string } }[]
  }
  const site = body.memberships.find((m) => m.site.name === siteName)?.site
  if (!site) throw new Error(`${person.email} has no site called ${siteName}`)
  const headers = { Authorization: `Bearer ${body.accessToken}`, 'X-Site-Id': site.id }

  return {
    siteId: site.id,
    async createPage(data: { type: string; title: string; slug: string; blocks?: object[] }) {
      const response = await request.post(`${flowApiUrl}/content`, { headers, data })
      expect(response.status(), `creating ${data.slug}`).toBe(201)
      return (await response.json()) as { id: string; title: string; path: string }
    },
    /** Saves through the real route, the way the editor does, and answers with its status. */
    async patchPage(id: string, body: object) {
      const response = await request.patch(`${flowApiUrl}/content/${id}`, { headers, data: body })
      return { status: response.status(), body: await response.json() }
    },
    /** Makes a page live, as the Publish button does. */
    async publish(id: string) {
      const response = await request.post(`${flowApiUrl}/content/${id}/publish`, { headers })
      expect(response.status(), 'publishing').toBe(200)
    },
    /** The site's appearance as the real API keeps it (GOV-04). */
    async getAppearance() {
      const response = await request.get(`${flowApiUrl}/appearance`, { headers })
      return { status: response.status(), body: await response.json() }
    },
    async getPage(id: string) {
      const response = await request.get(`${flowApiUrl}/content/${id}`, { headers })
      return { status: response.status(), body: await response.json() }
    },
    /** The slugs of the site's pages (up to 100), to check what exists. */
    async slugs(): Promise<string[]> {
      const response = await request.get(`${flowApiUrl}/content?limit=100`, { headers })
      const list = (await response.json()) as { items: { slug: string }[] }
      return list.items.map((item) => item.slug)
    },
  }
}
