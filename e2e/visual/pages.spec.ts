import { expect, test } from '@playwright/test'
import { fakeContent, fakePage, postType, signedInAs } from '../support/mock-api.ts'

/**
 * Screenshots of the page screens against the approved baselines. The content API's answers are
 * replaced, with the same pages every time, so the pictures do not change between runs; the real
 * flow is tested in e2e/flow/.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own']
const post = { id: postType.id, slug: postType.slug, name: postType.name }

const pages = [
  fakePage(1, { title: 'Welcome to Orchard Bakery', slug: 'welcome', status: 'published' }),
  fakePage(2, { title: 'About us', slug: 'about' }),
  fakePage(3, {
    title: 'Hello world',
    slug: 'hello-world',
    type: post,
    path: '/blog/hello-world',
    status: 'published',
  }),
  fakePage(4, { title: 'Opening hours', slug: 'opening-hours', status: 'pending_review' }),
  fakePage(5, {
    title: 'Our sourdough story',
    slug: 'sourdough',
    type: post,
    path: '/blog/sourdough',
  }),
  fakePage(6, { title: 'Contact', slug: 'contact' }),
]

for (const width of [375, 768, 1280]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('[UC-CS-13] the pages list looks as approved', async ({ page }) => {
      await fakeContent(page, pages)
      await signedInAs(page, EVERYTHING)
      await page.goto('/pages')
      await expect(page.getByRole('link', { name: 'Contact' })).toBeVisible()
      await expect(page).toHaveScreenshot(`pages-list-${width}.png`, { fullPage: true })
    })

    test('[UC-CS-13] the new page form looks as approved', async ({ page }) => {
      await fakeContent(page, pages)
      await signedInAs(page, EVERYTHING)
      await page.goto('/pages/new')
      await page.getByLabel('Title').fill('Our story')
      await expect(page.getByText('Address: /our-story')).toBeVisible()
      await expect(page).toHaveScreenshot(`new-page-${width}.png`, { fullPage: true })
    })

    test('[UC-CS-13] the edit page screen looks as approved', async ({ page }) => {
      await fakeContent(page, pages)
      await signedInAs(page, EVERYTHING)
      await page.goto(`/pages/${pages[2].id}`)
      await expect(page.getByRole('heading', { level: 1, name: 'Hello world' })).toBeVisible()
      await expect(page).toHaveScreenshot(`edit-page-${width}.png`, { fullPage: true })
    })
  })
}
