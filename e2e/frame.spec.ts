import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  SESSION_KEY,
  SITE_KEY,
  fakeContent,
  fakePage,
  fulfill,
  inDays,
  maple,
  orchard,
  postType,
  profileBody,
  readStorage,
  seedStorage,
  signedInAs,
} from './support/mock-api.ts'

/**
 * The WordPress-style frame (ADM-02): the bar on top, the menu on the left, the Sites screen and
 * the phone layout, with the API's answers replaced so roles and failures can be set on demand. The
 * real flow is in e2e/flow/frame.spec.ts.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own']
const post = { id: postType.id, slug: postType.slug, name: postType.name }
const menu = (page: Page) => page.getByRole('navigation', { name: 'Main' })
const menuEntries = (page: Page) => menu(page).locator('.menu-top')

test('[UC-BE-01] the menu offers the Dashboard, one entry per content type and Sites, and marks where you are', async ({
  page,
}) => {
  await fakeContent(page, [
    fakePage(1, { title: 'Welcome' }),
    fakePage(2, { title: 'Opening hours', type: post, path: '/blog/opening-hours' }),
  ])
  await signedInAs(page, EVERYTHING)

  await expect(menuEntries(page)).toHaveText(['Dashboard', 'Pages', 'Posts', 'Sites'])
  await expect(menu(page).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  )

  // A content type's entry lists that type only, and opens its own submenu.
  await menu(page).getByRole('link', { name: 'Posts', exact: true }).click()
  await expect(page).toHaveURL(/\/pages\?type=post$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Opening hours' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Welcome' })).toHaveCount(0)
  await expect(menu(page).getByRole('link', { name: 'All Posts' })).toHaveAttribute(
    'aria-current',
    'page',
  )

  // Its "Add New" opens the form with that type chosen.
  await menu(page).getByRole('link', { name: 'Add New' }).click()
  await expect(page).toHaveURL(/\/pages\/new\?type=post$/)
  await expect(page.getByLabel('Type')).toHaveValue('post')
  await expect(menu(page).getByRole('link', { name: 'Add New' })).toHaveAttribute(
    'aria-current',
    'page',
  )

  // The bar on top: the site, New site, who you are, Sign out.
  const bar = page.getByRole('banner')
  await expect(bar).toContainText('Orchard Bakery')
  await expect(bar).toContainText('Howdy, Olivia Orchard')
  await expect(bar.getByRole('link', { name: 'New site' })).toBeVisible()
  await expect(bar.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

test('[UC-BE-02] someone who may not create pages is not offered Add New anywhere', async ({
  page,
}) => {
  await fakeContent(page, [fakePage(1, { title: 'Welcome' })])
  await signedInAs(page, [])
  await menu(page).getByRole('link', { name: 'Pages', exact: true }).click()

  await expect(page.getByRole('link', { name: 'Welcome' })).toBeVisible()
  await expect(menu(page).getByRole('link', { name: 'All Pages' })).toBeVisible()
  await expect(menu(page).getByRole('link', { name: 'Add New' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Add New Page' })).toHaveCount(0)
})

test('[UC-BE-03] when the content types cannot load, one Content entry lists every type', async ({
  page,
}) => {
  const api = await fakeContent(page, [fakePage(1, { title: 'Welcome' })])
  api.override = (route, request) => {
    if (new URL(request.url()).pathname !== '/content-types') return false
    void fulfill(route, 500, { message: 'Internal server error' })
    return true
  }
  await signedInAs(page, EVERYTHING)

  await expect(menuEntries(page)).toHaveText(['Dashboard', 'Content', 'Sites'])
  await menu(page).getByRole('link', { name: 'Content' }).click()
  await expect(page).toHaveURL(/\/pages$/)
  await expect(page.getByRole('heading', { level: 1, name: 'All content' })).toBeVisible()
})

test('[UC-BE-04] the Sites screen lists your sites with your role, and switching makes another one current', async ({
  page,
}) => {
  await fakeContent(page, [])
  await page.route('**/auth/me', (route) => fulfill(route, 200, profileBody([orchard, maple])))
  await seedStorage(page, {
    [SESSION_KEY]: JSON.stringify({ accessToken: 'saved-token', expiresAt: inDays(1) }),
    [SITE_KEY]: orchard.site.id,
  })

  await menu(page).getByRole('link', { name: 'Sites' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sites' })).toBeVisible()
  const rows = page.locator('.list-table tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Orchard Bakery')
  await expect(rows.nth(0)).toContainText('Administrator')
  await expect(rows.nth(0)).toContainText('Current site')
  await expect(rows.nth(1)).toContainText('Editor')

  await page.getByRole('button', { name: 'Switch to Maple Books' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Maple Books' })).toBeVisible()
  expect(await readStorage(page, SITE_KEY)).toBe(maple.site.id)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 800 } })

  test('[UC-BE-05] the menu hides behind a Menu button, and following a link closes it', async ({
    page,
  }) => {
    await fakeContent(page, [fakePage(1, { title: 'Welcome' })])
    await signedInAs(page, EVERYTHING)
    const toggle = page.getByRole('button', { name: 'Menu' })

    await expect(menu(page)).toBeHidden()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.click()
    await expect(menu(page)).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await menu(page).getByRole('link', { name: 'Pages', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Pages' })).toBeVisible()
    await expect(menu(page)).toBeHidden()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
