import { expect, test } from '@playwright/test'
import { fakeSites, orchardHoldings, orchardSecond, signedInAs } from '../support/mock-api.ts'

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
  })
}
