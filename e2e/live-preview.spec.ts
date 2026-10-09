import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeContent, fakePage, signedInAs } from './support/mock-api.ts'

/**
 * The live preview beside the block forms (feature live-preview, D-030): the website's own block
 * components, copied into the admin, draw the page in the site's theme as the forms change. The
 * API's answers are replaced; the real flow is in e2e/flow/live-preview.spec.ts.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']
const preview = (page: Page) => page.frameLocator('iframe[title="Live preview of this page"]')
const withHero = fakePage(1, {
  title: 'Home',
  slug: 'home',
  blocks: [{ type: 'hero', headline: 'Fresh bread, every morning' }],
})

test('[UC-LP-02] the preview draws the blocks as the forms change, and leaves out what the site would', async ({
  page,
}) => {
  await fakeContent(page, [withHero])
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${withHero.id}`)

  const headline = preview(page).getByRole('heading', { level: 1 })
  await expect(headline).toHaveText('Fresh bread, every morning')

  // Typing changes it at once, before anything is saved.
  await page.getByLabel('Headline').fill('Warm loaves from six')
  await expect(headline).toHaveText('Warm loaves from six')

  // A new call to action is left out until its required fields are filled, as the site would.
  await page.getByRole('button', { name: 'Add Call to action' }).click()
  await expect(page.getByText('1 block is not shown')).toBeVisible()
  const cta = page.getByRole('region', { name: '2. Call to action' })
  await cta.getByLabel('Heading').fill('Visit us')
  await cta.getByLabel('Label').fill('Find the shop')
  await cta.getByLabel('Address').fill('/contact')
  await expect(page.getByText('1 block is not shown')).toHaveCount(0)
  await expect(preview(page).getByRole('heading', { name: 'Visit us' })).toBeVisible()
  await expect(preview(page).getByRole('link', { name: 'Find the shop' })).toBeVisible()

  // A link in the preview does not take the frame anywhere.
  await preview(page).getByRole('link', { name: 'Find the shop' }).click()
  await expect(preview(page).getByRole('heading', { name: 'Visit us' })).toBeVisible()
})

test('[UC-LP-03] the preview uses the site’s theme, and shows a desktop or a phone width', async ({
  page,
}) => {
  await fakeContent(page, [withHero])
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${withHero.id}`)

  // Orchard's stored paper colour, #fffaf0, laid over the default theme.
  const themeRoot = preview(page).locator('div[style*="--site-paper"]').first()
  await expect(themeRoot).toHaveCSS('background-color', 'rgb(255, 250, 240)')
  // The site's background fills the whole preview, not only behind the blocks.
  expect(await themeRoot.evaluate((element) => getComputedStyle(element).minHeight)).not.toBe('0px')

  const frame = page.locator('iframe[title="Live preview of this page"]')
  await expect(page.getByRole('button', { name: 'Desktop' })).toHaveAttribute('aria-pressed', 'true')
  await expect(frame).toHaveAttribute('style', /width: 1280px/)
  await page.getByRole('button', { name: 'Mobile' }).click()
  await expect(page.getByRole('button', { name: 'Mobile' })).toHaveAttribute('aria-pressed', 'true')
  await expect(frame).toHaveAttribute('style', /width: 390px/)
})
