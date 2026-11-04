import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import {
  fakeContent,
  fakePage,
  fakeVersion,
  fakeVersions,
  fulfill,
  person,
  signedInAs,
} from './support/mock-api.ts'
import type { FakePage, FakeVersion } from './support/mock-api.ts'

/**
 * The Versions screen (version-history T3, `docs/features/version-history/`): the list of a page's
 * versions, a look at an old one, and the way to Restore. The API's answers are stood in for
 * (`fakeVersions`); the whole journey on the real API is e2e/flow/versions.spec.ts (T5).
 */

// Times show in the viewer's own time zone; the tests that do not care about it pin one.
test.use({ timezoneId: 'UTC' })

const EDIT_ANY = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']
const OTHER_PERSON = '0198f2a0-0000-7000-8000-0000000000f2'
const maya = { id: '0198f2a0-0000-7000-8000-0000000000f3', name: 'Maya Moss' }

const hero = (headline: string) => ({ type: 'hero', headline })
const versionRows = (page: Page) =>
  page.getByRole('list', { name: 'Saved versions' }).getByRole('button')
const preview = (page: Page) => page.frameLocator('iframe[title="Preview of this version"]')
const restoreLink = (page: Page) => page.getByRole('link', { name: 'Restore this version' })
const versionCalls = (api: { calls: string[] }) =>
  api.calls.filter((call) => call.includes('/versions'))

/** A page, its versions (newest first) and a signed-in person with these permissions. */
async function open(
  page: Page,
  versions: FakeVersion[],
  options: { permissions?: string[]; role?: string; page?: Partial<FakePage> } = {},
) {
  const item = fakePage(1, { title: 'Opening hours', slug: 'opening-hours', ...options.page })
  await fakeContent(page, [item])
  const api = await fakeVersions(page, { [item.id]: versions })
  await signedInAs(page, options.permissions ?? EDIT_ANY, { role: options.role ?? 'Editor' })
  return { item, api }
}

test('[UC-VH-24] the Versions link leads to the screen and back, and the screen opens fresh by its address', async ({
  page,
}) => {
  const { item } = await open(page, [fakeVersion(3), fakeVersion(2), fakeVersion(1)])

  await page.goto(`/pages/${item.id}`)
  await page.getByRole('link', { name: 'Versions', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/pages/${item.id}/versions$`))
  await expect(
    page.getByRole('heading', { level: 1, name: 'Versions of Opening hours' }),
  ).toBeVisible()

  await page.getByRole('link', { name: '← Back to editing' }).click()
  await expect(page).toHaveURL(new RegExp(`/pages/${item.id}$`))
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Opening hours')

  // Opened fresh by its address, it is the same screen.
  await page.goto(`/pages/${item.id}/versions`)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Versions of Opening hours' }),
  ).toBeVisible()
})

const WHO: [string, string[], Partial<FakePage>, boolean][] = [
  ['an Administrator', [...EDIT_ANY, 'members.manage'], {}, true],
  ['an Editor', EDIT_ANY, {}, true],
  ['an Author on their own page', ['content.create', 'content.edit_own'], {}, true],
  [
    'an Author on someone else’s page',
    ['content.create', 'content.edit_own'],
    { createdBy: OTHER_PERSON, author: { id: OTHER_PERSON, name: 'Someone Else' } },
    false,
  ],
  ['a Viewer', [], {}, false],
]
for (const [who, permissions, pageFields, mayEdit] of WHO) {
  test(`[UC-VH-25] ${who}: the link is ${mayEdit ? 'there' : 'not there, and the screen says so and asks for no versions'}`, async ({
    page,
  }) => {
    const { item, api } = await open(page, [fakeVersion(2), fakeVersion(1)], {
      permissions,
      page: pageFields,
    })

    await page.goto(`/pages/${item.id}`)
    await expect(page.getByRole('heading', { name: 'Publish' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Versions', exact: true })).toHaveCount(
      mayEdit ? 1 : 0,
    )

    // Opened by its address, without the right: told so, and no version is asked for.
    if (!mayEdit) {
      await page.goto(`/pages/${item.id}/versions`)
      await expect(page.getByText('You can’t see this page’s versions.')).toBeVisible()
      expect(versionCalls(api)).toEqual([])
    }
  })
}

test('[UC-VH-26] the list is newest first, with when and who, and the newest is the Current version', async ({
  page,
}) => {
  const { item } = await open(page, [
    fakeVersion(3, { savedBy: maya }),
    fakeVersion(2),
    fakeVersion(1, { savedBy: maya }),
  ])
  await page.goto(`/pages/${item.id}/versions`)

  const rows = versionRows(page)
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('1 Oct, 09:03')
  await expect(rows.nth(0)).toContainText('Maya Moss')
  await expect(rows.nth(0)).toContainText('Current version')
  await expect(rows.nth(1)).toContainText('1 Oct, 09:02')
  await expect(rows.nth(1)).toContainText(person.name)
  await expect(rows.nth(1)).not.toContainText('Current version')
  await expect(rows.nth(2)).toContainText('1 Oct, 09:01')
  await expect(rows.nth(2)).toContainText('Maya Moss')
  await expect(page.getByText('Current version')).toHaveCount(1)

  // The newest is the one chosen when the screen opens.
  await expect(rows.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('3 versions')).toBeVisible()
})

/**
 * The contrast between a row's text and its own background (WCAG 2: 4.5 is the lowest that reads
 * well). Computed from the styles the browser really applies, because the page turns a button's text
 * white on hover and a row that goes pale would otherwise end up white on white.
 */
const contrastOf = (row: Locator) =>
  row.evaluate((element) => {
    const channels = (value: string) =>
      value
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
    const luminance = ([r, g, b]: number[]) => {
      const lin = (c: number) =>
        c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }
    const style = getComputedStyle(element)
    const text = luminance(channels(style.color))
    const ground = luminance(channels(style.backgroundColor))
    return (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05)
  })

test('[UC-VH-26] a version’s text stays readable while it is hovered and while it is chosen', async ({
  page,
}) => {
  const { item } = await open(page, [fakeVersion(3), fakeVersion(2), fakeVersion(1)])
  await page.goto(`/pages/${item.id}/versions`)
  const rows = versionRows(page)
  await expect(rows).toHaveCount(3)

  await page.mouse.move(0, 0)
  expect(await contrastOf(rows.nth(1))).toBeGreaterThan(4.5) // at rest
  await rows.nth(2).hover()
  expect(await contrastOf(rows.nth(2))).toBeGreaterThan(4.5) // hovered
  await rows.nth(2).click()
  expect(await contrastOf(rows.nth(2))).toBeGreaterThan(4.5) // chosen, still hovered
  await page.mouse.move(0, 0)
  expect(await contrastOf(rows.nth(2))).toBeGreaterThan(4.5) // chosen, at rest
})

test('[UC-VH-27] many versions: the first 20, then older ones on request', async ({ page }) => {
  const versions = Array.from({ length: 45 }, (_, at) => fakeVersion(45 - at))
  const { item, api } = await open(page, versions)
  await page.goto(`/pages/${item.id}/versions`)

  const rows = versionRows(page)
  const more = page.getByRole('button', { name: 'Show older versions' })
  await expect(rows).toHaveCount(20)
  await expect(page.getByText('Showing 20 of 45 versions.')).toBeVisible()
  await more.click()
  await expect(rows).toHaveCount(40)

  // A slice that fails is said, the rows already shown stay, and Try again gets it.
  api.override = (route, request) => {
    if (!request.url().includes('offset=40')) return false
    void fulfill(route, 500, { statusCode: 500, message: 'Internal server error' })
    return true
  }
  await more.click()
  await expect(page.getByText('Couldn’t load older versions.')).toBeVisible()
  await expect(rows).toHaveCount(40)
  api.override = null
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(rows).toHaveCount(45)
  await expect(more).toHaveCount(0)
  await expect(page.getByText('45 versions')).toBeVisible()
})

test('[UC-VH-28] a page with no stored versions says so', async ({ page }) => {
  const { item } = await open(page, [])
  await page.goto(`/pages/${item.id}/versions`)

  await expect(
    page.getByText(
      'No earlier versions yet. The version this page has now is kept the first time it is saved.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('list', { name: 'Saved versions' })).toHaveCount(0)
  await expect(restoreLink(page)).toHaveCount(0)
  await page.getByRole('link', { name: '← Back to editing' }).click()
  await expect(page).toHaveURL(new RegExp(`/pages/${item.id}$`))
})

test('[UC-VH-29] looking at an old version: read-only, with its blocks drawn by the preview', async ({
  page,
}) => {
  const { item } = await open(page, [
    fakeVersion(3, {
      title: 'Third title',
      blocks: [hero('Third headline')],
      seoTitle: 'Third search title',
      seoDescription: 'Third description',
      canonicalUrl: 'https://orchard.test/third',
      noIndex: true,
    }),
    fakeVersion(2, {
      title: 'Second title',
      blocks: [hero('Second headline')],
      seoTitle: 'Second search title',
    }),
    fakeVersion(1, { title: 'First title', blocks: [hero('First headline')] }),
  ])
  await page.goto(`/pages/${item.id}/versions`)

  // The newest is shown first: it is the page as it is now.
  const view = page.getByRole('region', { name: 'Version of 1 Oct, 09:03' })
  await expect(view.getByText('Third title')).toBeVisible()
  await expect(preview(page).getByRole('heading', { level: 1 })).toHaveText('Third headline')
  await expect(view.getByText('Third search title')).toBeVisible()
  await expect(view.getByText('Third description')).toBeVisible()
  await expect(view.getByText('https://orchard.test/third')).toBeVisible()
  await expect(view.getByText('Hidden from search engines')).toBeVisible()
  await expect(restoreLink(page)).toHaveCount(0)

  // Choosing the second shows that one, as plain text and as the preview draws it.
  await versionRows(page).nth(1).click()
  await expect(versionRows(page).nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(versionRows(page).nth(0)).toHaveAttribute('aria-pressed', 'false')
  const second = page.getByRole('region', { name: 'Version of 1 Oct, 09:02' })
  await expect(second.getByText('Second title')).toBeVisible()
  await expect(second.getByText('Second search title')).toBeVisible()
  await expect(second.getByText('Third title')).toHaveCount(0)
  await expect(preview(page).getByRole('heading', { level: 1 })).toHaveText('Second headline')
  await expect(restoreLink(page)).toBeVisible()

  // Nothing on a version can be edited, and looking asks for nothing to be saved.
  await expect(second.getByRole('textbox')).toHaveCount(0)
  await expect(second.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)

  await versionRows(page).nth(2).click()
  await expect(preview(page).getByRole('heading', { level: 1 })).toHaveText('First headline')
})

test('[UC-VH-30] an old version is drawn in the site’s own colours, checked by computed style', async ({
  page,
}) => {
  const { item } = await open(page, [
    fakeVersion(2, { blocks: [hero('Newer')] }),
    fakeVersion(1, { blocks: [hero('Older')] }),
  ])
  await page.goto(`/pages/${item.id}/versions`)
  await versionRows(page).nth(1).click()
  await expect(preview(page).getByRole('heading', { level: 1 })).toHaveText('Older')

  // Orchard's stored paper colour, #fffaf0, laid over the default theme: not white, not a default.
  const themeRoot = preview(page).locator('div[style*="--site-paper"]').first()
  await expect(themeRoot).toHaveCSS('background-color', 'rgb(255, 250, 240)')
  const text = await themeRoot.evaluate((element) => getComputedStyle(element).color)
  expect(text).not.toBe('rgb(0, 0, 0)')
  expect(text).not.toBe('rgb(255, 255, 255)')
  expect(await themeRoot.evaluate((element) => getComputedStyle(element).minHeight)).not.toBe('0px')
})

test.describe('failures on the Versions screen', () => {
  test('[UC-VH-36] a list that cannot load, a refusal, a missing page, a version that fails and an ended session are said in words', async ({
    page,
  }) => {
    const { item, api } = await open(page, [fakeVersion(2), fakeVersion(1)])
    const main = page.getByRole('main')
    const fail = (status: number | 'offline', only?: RegExp) => {
      api.override = (route, request) => {
        if (only && !only.test(new URL(request.url()).pathname)) return false
        if (status === 'offline') void route.abort('connectionrefused')
        else void fulfill(route, status, { statusCode: status, message: 'nope' })
        return true
      }
    }

    // A 500, then no connection: the same words, and Try again gets it once the server is back.
    fail(500)
    await page.goto(`/pages/${item.id}/versions`)
    await expect(page.getByText('Couldn’t load the versions.')).toBeVisible()
    await expect(main).not.toContainText(/500|ApiError|Internal server error|nope/)
    api.override = null
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(versionRows(page)).toHaveCount(2)

    fail('offline')
    await page.reload()
    await expect(page.getByText('Couldn’t load the versions.')).toBeVisible()
    await expect(main).not.toContainText(/Failed to fetch|NetworkError|ECONN/i)

    // The API says no: said, with no list.
    fail(403)
    await page.reload()
    await expect(page.getByText('You can’t see this page’s versions.')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Saved versions' })).toHaveCount(0)

    // A version that cannot be loaded is said beside the list, and the list stays.
    fail(500, /\/versions\/[^/]+$/)
    await page.reload()
    await expect(page.getByText('Couldn’t load this version.')).toBeVisible()
    await expect(versionRows(page)).toHaveCount(2)
    api.override = null
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('region', { name: 'Version of 1 Oct, 09:02' })).toBeVisible()
    await expect(page.getByText('Couldn’t load this version.')).toHaveCount(0)

    // A page that is not on this site.
    await page.goto('/pages/0198f2a0-0000-7000-8000-000000000999/versions')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to pages' })).toBeVisible()

    // The session has ended: the sign-in screen replaces the page.
    fail(401)
    await page.goto(`/pages/${item.id}/versions`)
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  })
})

test('[UC-VH-38] names and titles with HTML show as text', async ({ page }) => {
  const eve = { id: '0198f2a0-0000-7000-8000-0000000000f4', name: '<i>Eve</i>' }
  const { item } = await open(page, [fakeVersion(2, { savedBy: eve }), fakeVersion(1)], {
    page: { title: '<b>Bold</b>' },
  })
  await page.goto(`/pages/${item.id}/versions`)

  const main = page.getByRole('main')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Versions of <b>Bold</b>' }),
  ).toBeVisible()
  await expect(versionRows(page).nth(0)).toContainText('<i>Eve</i>')
  await expect(main.locator('b, i')).toHaveCount(0)
})

test.describe('time zones', () => {
  // 23:50 UTC on 8 October is already the 9th in Karachi (UTC+5) and still the 8th in Los Angeles (UTC-7 in October).
  const late = fakeVersion(1, { savedAt: '2026-10-08T23:50:00.000Z' })

  test.describe('in Karachi', () => {
    test.use({ timezoneId: 'Asia/Karachi' })
    test('[UC-VH-39] the time reads in the viewer’s own zone', async ({ page }) => {
      const { item } = await open(page, [late])
      await page.goto(`/pages/${item.id}/versions`)
      await expect(versionRows(page).nth(0)).toContainText('9 Oct, 04:50')
    })
  })

  test.describe('in Los Angeles', () => {
    test.use({ timezoneId: 'America/Los_Angeles' })
    test('[UC-VH-39] the same instant reads in the other zone', async ({ page }) => {
      const { item } = await open(page, [late])
      await page.goto(`/pages/${item.id}/versions`)
      await expect(versionRows(page).nth(0)).toContainText('8 Oct, 16:50')
    })
  })
})

test('[UC-VH-40] Restore stays in view on a very long version, and everything works from the keyboard', async ({
  page,
}) => {
  const long = Array.from({ length: 40 }, (_, at) => hero(`Block number ${at + 1}`))
  const { item } = await open(page, [
    fakeVersion(3),
    fakeVersion(2, { title: 'Long one', blocks: long }),
    fakeVersion(1),
  ])
  await page.setViewportSize({ width: 1280, height: 700 })
  await page.goto(`/pages/${item.id}/versions`)

  // From the keyboard alone: the second row is chosen with Enter, then Tab reaches Restore.
  await versionRows(page).nth(0).focus()
  await page.keyboard.press('Tab')
  await expect(versionRows(page).nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(versionRows(page).nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(preview(page).getByRole('heading', { level: 1 }).first()).toBeVisible()

  // Restore is in view without scrolling, however long the version is.
  await expect(restoreLink(page)).toBeInViewport()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(restoreLink(page)).toBeFocused()
  await page.keyboard.press('Enter')
  const second = fakeVersion(2)
  await expect(page).toHaveURL(new RegExp(`/pages/${item.id}\\?restore=${second.id}$`))
})
