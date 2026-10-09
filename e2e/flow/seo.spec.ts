import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { admin } from './tenants.ts'
import { openSite, realApi, signInThroughTheScreen, unique } from './support.ts'

/**
 * The search engines box on the REAL flow (SEO-01): a real browser, the real admin, the real API
 * and database. A person fills in a page's search fields on its edit screen, watches the search
 * result preview follow, and saves them; the real API is then asked what it stored.
 */

const ORCHARD = 'Orchard Bakery'

const preview = (page: Page) => page.getByRole('group', { name: 'Search result preview' })

test('[UC-SEO-07] fills in the search box, the result preview follows as it is typed, and Save stores it', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  const made = await api.createPage({
    type: 'page',
    title: `Visit ${token}`,
    slug: `visit-${token}`,
  })
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)

  // Before anything is typed: the page's own title and address, and no description.
  await expect(preview(page)).toContainText(`Visit ${token} — ${ORCHARD}`)
  await expect(preview(page)).toContainText(`orchard.test:3000 › visit-${token}`)
  await expect(preview(page)).toContainText('No description')
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()

  await page.getByLabel('SEO title').fill(`Visit the bakery ${token}`)
  await expect(preview(page)).toContainText(`Visit the bakery ${token}`)
  await expect(preview(page)).not.toContainText(`— ${ORCHARD}`)
  await expect(page.getByText('23 characters. Google shows about 60.')).toBeVisible()

  await page.getByLabel('Meta description').fill('Open every day from seven, on the harbour.')
  await expect(preview(page)).toContainText('Open every day from seven, on the harbour.')

  await page.getByLabel('Hide this page from search engines').check()
  await expect(preview(page)).toContainText('Hidden: this page asks search engines not to list it.')

  await page.getByText('Advanced', { exact: true }).click()
  await page.getByLabel('Canonical address').fill('https://orchard.example/visit')
  await expect(preview(page)).toContainText('orchard.example › visit')

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()

  const stored = await api.getPage(made.id)
  expect(stored.body).toMatchObject({
    title: `Visit ${token}`,
    seoTitle: `Visit the bakery ${token}`,
    seoDescription: 'Open every day from seven, on the harbour.',
    canonicalUrl: 'https://orchard.example/visit',
    noIndex: true,
  })

  await page.reload()
  await expect(page.getByLabel('SEO title')).toHaveValue(`Visit the bakery ${token}`)
  await expect(page.getByLabel('Meta description')).toHaveValue(
    'Open every day from seven, on the harbour.',
  )
  await expect(page.getByLabel('Hide this page from search engines')).toBeChecked()
  // A page with its own canonical address opens with Advanced showing it.
  await expect(page.getByLabel('Canonical address')).toHaveValue('https://orchard.example/visit')
})

test('[UC-SEO-08] a canonical address that is not a full one is refused before saving; emptied boxes fall back to the page’s own and are stored as none; Publish waits for them', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  const made = await api.createPage({ type: 'page', title: `Menu ${token}`, slug: `menu-${token}` })
  const set = await api.patchPage(made.id, {
    seoTitle: 'Our menu',
    canonicalUrl: 'https://orchard.example/menu',
  })
  expect(set.status).toBe(200)
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)

  const canonical = page.getByLabel('Canonical address')
  await expect(canonical).toHaveValue('https://orchard.example/menu')
  await canonical.fill('orchard.example/menu')
  // A search field not yet saved holds Publish back, as any change does.
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled()
  await expect(page.getByText('Save your changes first.')).toBeVisible()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(
    page.getByText('Use a full address starting with https:// or http://.'),
  ).toBeVisible()
  await expect(canonical).toBeFocused()
  await expect(canonical).toHaveAttribute('aria-invalid', 'true')
  expect((await api.getPage(made.id)).body.canonicalUrl).toBe('https://orchard.example/menu')

  // Emptied, each box falls back to what the website uses without it.
  await canonical.fill('')
  await page.getByLabel('SEO title').fill('')
  await expect(preview(page)).toContainText(`Menu ${token} — ${ORCHARD}`)
  await expect(preview(page)).toContainText(`orchard.test:3000 › menu-${token}`)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publish' })).toBeEnabled()

  const stored = await api.getPage(made.id)
  expect(stored.body).toMatchObject({ seoTitle: null, canonicalUrl: null, noIndex: false })
})
