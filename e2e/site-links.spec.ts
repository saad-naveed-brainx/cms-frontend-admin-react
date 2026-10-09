import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { siteLink } from './flow/env.ts'
import {
  SESSION_KEY,
  SITE_KEY,
  fakeContent,
  fakePage,
  fulfill,
  inDays,
  maple,
  orchard,
  profileBody,
  seedStorage,
  signedInAs,
} from './support/mock-api.ts'

/**
 * Links from the admin to the public website (feature site-preview): the site's address comes from
 * sign-in, and only a published page is linked, because anything else is the website's 404. The
 * API's answers are replaced; the real flow is in e2e/flow/site-links.spec.ts. Every browser test
 * runs the admin with the same link settings, so `siteLink` says exactly what a link must be.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']

/** Signed in to one site whose main address is `host` (or none). */
async function signedInWithHost(page: Page, host: string | null) {
  const membership = {
    ...orchard,
    site: { ...orchard.site, primaryHost: host },
    permissions: EVERYTHING,
  }
  await page.route('**/auth/me', (route) => fulfill(route, 200, profileBody([membership])))
  await seedStorage(page, {
    [SESSION_KEY]: JSON.stringify({ accessToken: 'saved-token', expiresAt: inDays(1) }),
  })
}

test('[UC-SP-02] the bar and the Dashboard link to the site, in a new tab', async ({ page }) => {
  await fakeContent(page, [])
  await signedInAs(page, EVERYTHING)

  const visit = page.getByRole('banner').getByRole('link', { name: 'Visit Site' })
  await expect(visit).toHaveAttribute('href', siteLink('orchard.test'))
  await expect(visit).toHaveAttribute('target', '_blank')
  await expect(visit).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.getByRole('main').getByRole('link', { name: 'Visit site' })).toHaveAttribute(
    'href',
    siteLink('orchard.test'),
  )
})

test('[UC-SP-02] a site with no address offers no link to it', async ({ page }) => {
  await fakeContent(page, [])
  await signedInWithHost(page, null)

  await expect(page.getByRole('heading', { level: 2, name: 'Orchard Bakery' })).toBeVisible()
  await expect(page.getByRole('link', { name: /visit site/i })).toHaveCount(0)
})

test('[UC-SP-03] the list offers View only for published pages, and the home page is the front page', async ({
  page,
}) => {
  await fakeContent(page, [
    fakePage(1, { title: 'Home', slug: 'home', status: 'published' }),
    fakePage(2, { title: 'About', slug: 'about', status: 'published' }),
    fakePage(3, { title: 'Draft plans', slug: 'plans' }),
  ])
  await signedInAs(page, EVERYTHING)
  await page.goto('/pages?type=page')

  const row = (title: string) => page.locator('.list-table tbody tr', { hasText: title })
  await expect(row('Home').getByRole('link', { name: 'View' })).toHaveAttribute(
    'href',
    siteLink('orchard.test', '/'),
  )
  await expect(row('About').getByRole('link', { name: 'View' })).toHaveAttribute(
    'href',
    siteLink('orchard.test', '/about'),
  )
  await expect(row('Draft plans').getByRole('link', { name: 'View' })).toHaveCount(0)
  await expect(row('Draft plans').getByRole('link', { name: 'Edit' })).toBeVisible()
})

test('[UC-SP-04] the edit screen offers one way to look at the page on its site: Preview before it is published, View page after', async ({
  page,
}) => {
  await fakeContent(page, [
    fakePage(1, { title: 'About', slug: 'about', status: 'published' }),
    fakePage(2, { title: 'Draft plans', slug: 'plans' }),
  ])
  await signedInAs(page, EVERYTHING)

  await page.goto(`/pages/${fakePage(1).id}`)
  await expect(page.getByRole('link', { name: 'View page' })).toHaveAttribute(
    'href',
    siteLink('orchard.test', '/about'),
  )
  // Saving a published page updates it at once, so a preview would only show the live page again.
  await expect(page.getByRole('button', { name: 'Preview' })).toHaveCount(0)
  await page.getByLabel('Title', { exact: true }).fill('About us')
  await expect(
    page.getByText('Save your changes first: visitors see the page as last saved.'),
  ).toBeVisible()

  await page.goto(`/pages/${fakePage(2).id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Draft plans' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View page' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Preview' })).toBeEnabled()
})

test('[UC-SP-05] the Sites screen shows each site’s address and links to it', async ({ page }) => {
  await fakeContent(page, [])
  await page.route('**/auth/me', (route) => fulfill(route, 200, profileBody([orchard, maple])))
  await seedStorage(page, {
    [SESSION_KEY]: JSON.stringify({ accessToken: 'saved-token', expiresAt: inDays(1) }),
    [SITE_KEY]: orchard.site.id,
  })
  await page.goto('/sites')

  const rows = page.locator('.list-table tbody tr')
  await expect(rows.nth(0)).toContainText('orchard.test')
  await expect(rows.nth(1)).toContainText('maple.test')
  await expect(page.getByRole('link', { name: 'Visit Maple Books' })).toHaveAttribute(
    'href',
    siteLink('maple.test'),
  )
})
