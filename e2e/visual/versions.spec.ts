import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  fakeContent,
  fakePage,
  fakeVersion,
  fakeVersions,
  fulfill,
  signedInAs,
} from '../support/mock-api.ts'
import type { FakeVersion } from '../support/mock-api.ts'

/**
 * Screenshots of the Versions screen and of a restored edit screen against the approved baselines
 * (version-history T5, UC-VH-43). The API's answers are replaced, with the same pages, versions and
 * dates every time (UTC), so the pictures do not change between runs. The edit screen's own baselines
 * (with the Versions link) are in pages.spec.ts.
 */

test.use({ timezoneId: 'UTC' })

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']

/** Long on purpose: a title that wraps, and a name and a title with nothing to break at. */
const LONG_TITLE =
  'Our complete and thoroughly detailed seasonal opening hours, holiday closures and special event arrangements for the whole year'
const LONG_NAME = 'Maximilian-Alexander-Wolfeschlegelsteinhausenbergerdorff-Montgomery'
const LONG_WORD =
  'Supercalifragilisticexpialidocious-and-other-extraordinarily-long-words-without-breaks'

const page1 = fakePage(1, { title: LONG_TITLE, slug: 'opening-hours', status: 'published' })

const blocks = [
  {
    type: 'hero',
    eyebrow: 'Opening hours',
    headline: 'Open every day, early and late',
    body: 'Come in for breakfast, stay for the afternoon.',
    primaryAction: { label: 'Find the shop', href: '/contact' },
  },
  {
    type: 'richText',
    heading: 'Holidays',
    html: '<p>We close on <strong>Christmas Day</strong> and open late on New Year’s Day.</p>',
  },
]

/** Newest first: six versions, a long saver name on one, a long unbreakable title on the chosen one. */
const versions: FakeVersion[] = [
  fakeVersion(6, { title: LONG_TITLE, blocks }),
  fakeVersion(5, { title: 'Opening hours, spring', blocks: [blocks[0]] }),
  fakeVersion(4, {
    title: LONG_WORD,
    blocks,
    seoTitle: 'Opening hours | Orchard Bakery',
    seoDescription: 'When we are open, every day of the year, and when we are not.',
    canonicalUrl: 'https://orchard.test/opening-hours',
    noIndex: true,
    savedBy: { id: '0198f2a0-0000-7000-8000-0000000000e1', name: LONG_NAME },
  }),
  fakeVersion(3, { title: 'Opening hours', blocks: [] }),
  fakeVersion(2, { title: 'Hours', savedBy: null }),
  fakeVersion(1, { title: 'Hours (draft)' }),
]

async function open(page: Page, byPage: FakeVersion[]) {
  await fakeContent(page, [page1])
  const api = await fakeVersions(page, { [page1.id]: byPage })
  await signedInAs(page, EVERYTHING, { role: 'Editor' })
  return api
}

/** Nothing may be wider than the screen: no sideways scrolling. */
const fitsTheScreen = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

for (const width of [375, 768, 1280]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('[UC-VH-43] the Versions screen with a version chosen looks as approved', async ({
      page,
    }) => {
      await open(page, versions)
      await page.goto(`/pages/${page1.id}/versions`)
      // The third version, with the long saver name, the long title and every search field.
      await page.getByRole('list', { name: 'Saved versions' }).getByRole('button').nth(2).click()
      await expect(
        page.getByRole('heading', { level: 2, name: 'Version of 1 Oct, 09:04' }),
      ).toBeVisible()
      await expect(page.getByText(LONG_WORD)).toBeVisible()
      // Drawn by the preview, in the site's own theme.
      await expect(
        page
          .frameLocator('iframe[title="Preview of this version"]')
          .getByText('Open every day, early and late'),
      ).toBeVisible()
      expect(await fitsTheScreen(page)).toBe(true)
      await expect(page).toHaveScreenshot(`versions-list-${width}.png`, { fullPage: true })
    })

    test('[UC-VH-43] the Versions screen with nothing saved yet looks as approved', async ({
      page,
    }) => {
      await open(page, [])
      await page.goto(`/pages/${page1.id}/versions`)
      await expect(page.getByText('No earlier versions yet.')).toBeVisible()
      expect(await fitsTheScreen(page)).toBe(true)
      await expect(page).toHaveScreenshot(`versions-empty-${width}.png`, { fullPage: true })
    })

    test('[UC-VH-43] the Versions screen while loading looks as approved', async ({ page }) => {
      const api = await open(page, versions)
      // The list is asked for and never answered, so the screen stays as it is while it waits.
      api.override = () => true
      await page.goto(`/pages/${page1.id}/versions`)
      await expect(page.getByRole('status')).toHaveText('Loading versions…')
      await expect(page).toHaveScreenshot(`versions-loading-${width}.png`, { fullPage: true })
    })

    test('[UC-VH-43] the Versions screen when the list fails looks as approved', async ({
      page,
    }) => {
      const api = await open(page, versions)
      api.override = (route) => {
        void fulfill(route, 500, { message: 'Internal server error' })
        return true
      }
      await page.goto(`/pages/${page1.id}/versions`)
      await expect(page.getByRole('alert')).toContainText('Couldn’t load the versions.')
      expect(await fitsTheScreen(page)).toBe(true)
      await expect(page).toHaveScreenshot(`versions-error-${width}.png`, { fullPage: true })
    })

    test('[UC-VH-43] the edit screen with a version restored looks as approved', async ({
      page,
    }) => {
      await open(page, versions)
      await page.goto(`/pages/${page1.id}?restore=${versions[2].id}`)
      await expect(page.getByLabel('Title', { exact: true })).toHaveValue(LONG_WORD)
      await expect(page.locator('main > p.notice')).toContainText('is loaded')
      await expect(page.getByText('You have unsaved changes.')).toBeVisible()
      expect(await fitsTheScreen(page)).toBe(true)
      await expect(page).toHaveScreenshot(`edit-page-restored-${width}.png`, { fullPage: true })
    })
  })
}
