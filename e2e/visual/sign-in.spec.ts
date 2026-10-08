import { expect, test } from '@playwright/test'
import {
  SESSION_KEY,
  fulfill,
  inDays,
  profileBody,
  seedStorage,
} from '../support/mock-api.ts'

/**
 * Screenshots of the new screens against the approved baselines. The API's answers are replaced so
 * the pictures are the same every time; the real flow is tested in e2e/flow/.
 */

for (const width of [375, 768, 1280]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('[UC-AS-13] the sign-in screen looks as approved', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
      await expect(page).toHaveScreenshot(`sign-in-${width}.png`, { fullPage: true })
    })

    test('[UC-AS-13] the sign-in screen with an error looks as approved', async ({ page }) => {
      await page.route('**/auth/login', (route) =>
        fulfill(route, 401, { message: 'Unauthorized' }),
      )
      await page.goto('/')
      await page.getByLabel('Email').fill('olivia@orchard.test')
      await page.getByLabel('Password').fill('a password')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(page).toHaveScreenshot(`sign-in-error-${width}.png`, { fullPage: true })
    })

    test('[UC-AS-13] the signed-in frame looks as approved', async ({ page }) => {
      await page.route('**/auth/me', (route) => fulfill(route, 200, profileBody()))
      await seedStorage(page, {
        [SESSION_KEY]: JSON.stringify({ accessToken: 'saved-token', expiresAt: inDays(1) }),
      })
      await expect(page.getByRole('heading', { level: 1, name: 'Orchard Bakery' })).toBeVisible()
      await page.getByText('What this role allows').click()
      await expect(page).toHaveScreenshot(`signed-in-${width}.png`, { fullPage: true })
    })
  })
}
