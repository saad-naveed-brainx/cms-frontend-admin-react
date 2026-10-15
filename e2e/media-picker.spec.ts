import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  SAMPLE_PNG,
  fakeAppearance,
  fakeContent,
  fakeMedia,
  fakeMediaItem,
  fakePage,
  signedInAs,
} from './support/mock-api.ts'

/**
 * Choosing a library picture (feature media, MED-03): in an image block and as the site's logo,
 * with the API's answers given here so the test sees exactly what is saved. The real flow is in
 * e2e/flow/media-picker.spec.ts.
 */

const EDITOR = ['content.create', 'content.edit_any', 'media.upload']
const ADMIN = [...EDITOR, 'settings.manage']
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })
const picker = (page: Page, title: string) => page.getByRole('dialog', { name: title })
const sourdough = fakeMediaItem(2, { filename: 'sourdough.png' })
const shopFront = fakeMediaItem(1, { filename: 'shop-front.png' })

test('[UC-MD-09] in an image block, a picture is chosen from the library or uploaded there; it fills the address, the alt text is next, and the preview shows it; Escape changes nothing', async ({
  page,
}) => {
  const home = fakePage(1, {
    title: 'Home',
    slug: 'home',
    blocks: [{ type: 'hero', headline: 'Hi' }],
  })
  const content = await fakeContent(page, [home])
  const media = await fakeMedia(page, [sourdough, shopFront])
  await signedInAs(page, EDITOR)
  await page.goto(`/pages/${home.id}`)

  const image = page.getByRole('region', { name: '1. Hero' }).getByRole('group', { name: 'Image' })
  await image.getByRole('button', { name: 'Choose from library' }).click()
  const window = picker(page, 'Choose a picture')
  await expect(window).toBeVisible()
  await expect(window.getByRole('button', { name: /^Choose / })).toHaveText([
    'sourdough.png',
    'shop-front.png',
  ])

  // Escape: closed, nothing chosen, nothing unsaved.
  await page.keyboard.press('Escape')
  await expect(window).toHaveCount(0)
  await expect(save(page)).toBeDisabled()

  await image.getByRole('button', { name: 'Choose from library' }).click()
  await window.getByRole('button', { name: 'Choose sourdough.png' }).click()
  await expect(window).toHaveCount(0)
  await expect(image.getByLabel('Image address')).toHaveValue(sourdough.url)
  await expect(image.getByLabel('Alt text')).toBeFocused()
  await expect(image.getByRole('button', { name: 'Change picture' })).toBeVisible()
  // The site draws a picture only with words for it, so the preview shows it once the alt text is written.
  const preview = page.frameLocator('iframe[title="Live preview of this page"]')
  await expect(preview.locator('img')).toHaveCount(0)
  await image.getByLabel('Alt text').fill('A sourdough loaf')
  await expect(preview.getByRole('img', { name: 'A sourdough loaf' })).toHaveAttribute(
    'src',
    sourdough.url,
  )
  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(content.saved.at(-1)).toEqual({
    blocks: [
      { type: 'hero', headline: 'Hi', image: { src: sourdough.url, alt: 'A sourdough loaf' } },
    ],
  })

  // A new picture uploaded from the same window is chosen at once.
  await image.getByRole('button', { name: 'Change picture' }).click()
  await window.getByLabel('Upload a new picture').setInputFiles({
    name: 'fresh rolls.png',
    mimeType: 'image/png',
    buffer: SAMPLE_PNG,
  })
  await expect(window).toHaveCount(0)
  expect(media.uploads).toEqual(['fresh rolls.png'])
  await expect(image.getByLabel('Image address')).toHaveValue(/\/uploads\/.+\.png$/)
  await expect(image.getByLabel('Image address')).not.toHaveValue(sourdough.url)
  // Alt text was already written, so the cursor is not moved there.
  await expect(image.getByLabel('Alt text')).toHaveValue('A sourdough loaf')
})

test('[UC-MD-10] on the Appearance screen a logo is chosen from the library, shown in the preview’s header and saved; Remove logo clears it', async ({
  page,
}) => {
  await fakeContent(page, [
    fakePage(1, { title: 'Home', slug: 'home', path: '/home', status: 'published' }),
  ])
  const appearance = await fakeAppearance(page, {
    name: 'Orchard Bakery',
    tagline: '',
    footerNote: '',
    theme: {},
  })
  await fakeMedia(page, [sourdough, shopFront])
  await signedInAs(page, ADMIN)
  await page.goto('/appearance')

  await expect(page.getByText('No logo: the header shows the site’s name only.')).toBeVisible()
  await page.getByRole('button', { name: 'Choose a logo' }).click()
  await picker(page, 'Choose a logo').getByRole('button', { name: 'Choose shop-front.png' }).click()
  await expect(page.getByRole('img', { name: 'The logo' })).toHaveAttribute('src', shopFront.url)

  const header = page.frameLocator('iframe[title="Live preview of the site"]').getByRole('banner')
  await expect(header.getByRole('link', { name: 'Orchard Bakery' }).locator('img')).toHaveAttribute(
    'src',
    shopFront.url,
  )

  await save(page).click()
  await expect(page.getByText('Saved. The site shows it now.')).toBeVisible()
  expect(appearance.saved).toEqual([{ logoUrl: shopFront.url }])

  await page.getByRole('button', { name: 'Remove logo' }).click()
  await expect(header.locator('img')).toHaveCount(0)
  await save(page).click()
  await expect(page.getByText('Saved. The site shows it now.')).toBeVisible()
  expect(appearance.saved[1]).toEqual({ logoUrl: '' })
  await expect(page.getByRole('button', { name: 'Choose a logo' })).toBeVisible()
})
