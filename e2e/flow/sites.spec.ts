import { expect, test } from '@playwright/test'
import { flowApiUrl } from './env.ts'
import { maker, tenants } from './tenants.ts'
import { realApi, signInThroughTheScreen, unique } from './support.ts'

/**
 * Creating a site on the REAL flow: a real browser, the real admin, the real API and a real
 * database. The person was made by the real seed command; the site is made through the screen and
 * then looked up by asking the real API, never written into the page. Only Mia (`maker`) creates
 * sites here, because it changes her list of sites.
 */

const newSiteLink = (page: import('@playwright/test').Page) =>
  page.getByRole('banner').getByRole('link', { name: 'New site' })

test('[UC-RS-12] creates a site through the screen: it is selected, empty, listed by the real API and answers on its address', async ({
  page,
  request,
}) => {
  const token = unique()
  const siteName = `Maker Cafe ${token}`
  const host = `cafe-${token}.test`
  await signInThroughTheScreen(page, maker.admin)
  // One site so far: no Site control yet.
  await expect(page.getByLabel('Site')).toHaveCount(0)

  await newSiteLink(page).click()
  await expect(page.getByRole('heading', { level: 1, name: 'New site' })).toBeVisible()
  // Mia owns one organisation, so she is not asked which.
  await expect(page.getByLabel('Organisation')).toHaveCount(0)
  await page.getByLabel('Name', { exact: true }).fill(`  ${siteName}  `)
  await page.getByLabel('Web address', { exact: true }).fill(`https://${host.toUpperCase()}/`)
  await page.getByRole('button', { name: 'Create site' }).click()

  await expect(page).toHaveURL(/\/pages$/)
  await expect(page.getByText('Site created.')).toBeVisible()
  await expect(page.getByText('No pages yet.')).toBeVisible()

  // The real API lists the site for her, with her as its administrator, and the Site control shows it selected.
  const api = await realApi(request, maker.admin, siteName)
  const switcher = page.getByLabel('Site')
  await expect(switcher).toHaveValue(api.siteId)
  await expect(switcher.locator('option', { hasText: `${siteName} · Administrator` })).toHaveCount(
    1,
  )
  await expect(page.getByRole('link', { name: 'New page', exact: true })).toBeVisible()

  // Its address answers at once, tidied by the API (lower-case, no scheme).
  const resolved = await request.get(`${flowApiUrl}/sites/resolve?host=${host}`)
  expect(resolved.status()).toBe(200)
  expect(await resolved.json()).toMatchObject({
    site: { id: api.siteId, name: siteName },
    canonicalHost: host,
    isCanonical: true,
  })

  // A reload keeps working on the new site.
  await page.reload()
  await expect(page.getByLabel('Site')).toHaveValue(api.siteId)
})

test('[UC-RS-12] an address another site uses is shown on that address, and nothing is created', async ({
  page,
  request,
}) => {
  const token = unique()
  const siteName = `Never made ${token}`
  await signInThroughTheScreen(page, maker.admin)

  await newSiteLink(page).click()
  await page.getByLabel('Name', { exact: true }).fill(siteName)
  await page.getByLabel('Web address', { exact: true }).fill(tenants[0].host.toUpperCase())
  await page.getByRole('button', { name: 'Create site' }).click()

  await expect(page.getByLabel('Web address', { exact: true })).toHaveAccessibleDescription(
    'That web address is already used by another site.',
  )
  await expect(page).toHaveURL(/\/sites\/new$/)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(siteName)

  // The real API has no such site for her.
  const login = await request.post(`${flowApiUrl}/auth/login`, {
    data: { email: maker.admin.email, password: maker.admin.password },
  })
  const names = (
    (await login.json()) as { memberships: { site: { name: string } }[] }
  ).memberships.map((membership) => membership.site.name)
  expect(names).not.toContain(siteName)
})
