import { expect, test } from '@playwright/test'
import {
  SESSION_KEY,
  SITE_KEY,
  fakeContent,
  fakePage,
  fakeSites,
  fulfill,
  inDays,
  maple,
  orchard,
  orchardHoldings,
  orchardSecond,
  profileBody,
  seedStorage,
  signedInAs,
} from '../support/mock-api.ts'

/**
 * Screenshots of the New site screen against the approved baselines. The API's answers are
 * replaced, with the same organisations every time, so the pictures do not change between runs;
 * the real flow is tested in e2e/flow/.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']

for (const width of [375, 768, 1280]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('[UC-RS-13] the new site form looks as approved', async ({ page }) => {
      await fakeContent(page, [])
      const session = await signedInAs(page, EVERYTHING)
      await fakeSites(page, session, [orchardHoldings, orchardSecond])
      await page.goto('/sites/new')
      await page.getByLabel('Name', { exact: true }).fill('Orchard Cafe')
      await page.getByLabel('Web address', { exact: true }).fill('cafe.example.com')
      await page.getByRole('button', { name: 'Add another address' }).click()
      await page.getByRole('button', { name: 'Create site' }).click()
      await expect(page.getByText('Choose an organisation.')).toBeVisible()
      await expect(page).toHaveScreenshot(`new-site-${width}.png`, {
        fullPage: true,
      })
    })

    test('[UC-BE-07] the Sites screen looks as approved', async ({ page }) => {
      await fakeContent(page, [])
      await page.route('**/auth/me', (route) => fulfill(route, 200, profileBody([orchard, maple])))
      await seedStorage(page, {
        [SESSION_KEY]: JSON.stringify({ accessToken: 'saved-token', expiresAt: inDays(1) }),
        [SITE_KEY]: orchard.site.id,
      })
      await page.goto('/sites')
      await expect(page.getByRole('button', { name: 'Switch to Maple Books' })).toBeVisible()
      await expect(page).toHaveScreenshot(`sites-${width}.png`, { fullPage: true })
    })
  })
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 800 } })

  test('[UC-BE-07] the open menu looks as approved', async ({ page }) => {
    await fakeContent(page, [fakePage(1, { title: 'Welcome' })])
    await signedInAs(page, EVERYTHING)
    await page.goto('/pages?type=page')
    await expect(page.getByRole('link', { name: 'Welcome' })).toBeVisible()
    await page.getByRole('button', { name: 'Menu' }).click()
    await expect(page.getByRole('link', { name: 'All Pages' })).toBeVisible()
    await expect(page).toHaveScreenshot('menu-open-375.png')
  })
})
