import { expect, test } from '@playwright/test'
import { siteLink } from './env.ts'
import { openSite, realApi, signInThroughTheScreen } from './support.ts'
import { admin, tenants } from './tenants.ts'

/**
 * Links to the website on the REAL flow: the addresses come from the real sign-in, made by the
 * real seed command, never from the test.
 */

test('[UC-SP-06] the real sign-in gives each site its seeded address, and the admin links to it', async ({
  page,
  request,
}) => {
  const [orchard, maple] = tenants
  const api = await realApi(request, admin, orchard.site)

  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await expect(page.getByRole('banner').getByRole('link', { name: 'Visit Site' })).toHaveAttribute(
    'href',
    siteLink(orchard.host),
  )

  await page.goto('/sites')
  await expect(page.getByRole('link', { name: `Visit ${maple.site}` })).toHaveAttribute(
    'href',
    siteLink(maple.host),
  )
})
