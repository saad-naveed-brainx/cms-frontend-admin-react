import { expect, test } from '@playwright/test'
import { fakeContent, fakePage, postType, signedInAs } from '../support/mock-api.ts'

/**
 * Screenshots of the page screens against the approved baselines. The content API's answers are
 * replaced, with the same pages every time, so the pictures do not change between runs; the real
 * flow is tested in e2e/flow/.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']
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

const withBlocks = fakePage(7, {
  title: 'Welcome to Orchard Bakery',
  slug: 'welcome-blocks',
  blocks: [
    {
      type: 'hero',
      eyebrow: 'Baked at dawn',
      headline: 'Fresh bread, every morning',
      body: 'Sourdough, rye and seeded loaves from our own oven.',
      primaryAction: { label: 'Order now', href: '/shop' },
      image: { src: 'https://example.com/loaf.jpg', alt: 'A loaf of sourdough' },
    },
    {
      type: 'featureGrid',
      heading: 'Why Orchard',
      ordered: true,
      items: [
        { title: 'Slow dough', body: 'Proved for two days.' },
        { title: 'Local flour', body: 'Milled twenty miles away.' },
      ],
    },
    { type: 'richText', html: '<p>Stored before the rule</p>' },
    { type: 'cta', heading: 'Visit us', action: { label: 'Find the shop', href: '/contact' } },
  ],
})

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
      await page.getByLabel('Title', { exact: true }).fill('Our story')
      await expect(page.getByText('Address: /our-story')).toBeVisible()
      await expect(page).toHaveScreenshot(`new-page-${width}.png`, { fullPage: true })
    })

    test('[UC-RS-21] the edit page with blocks looks as approved', async ({ page }) => {
      await fakeContent(page, [withBlocks])
      await signedInAs(page, EVERYTHING)
      await page.goto(`/pages/${withBlocks.id}`)
      await expect(page.getByRole('heading', { level: 3 })).toHaveCount(4)
      await expect(page).toHaveScreenshot(`edit-page-blocks-${width}.png`, { fullPage: true })
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
