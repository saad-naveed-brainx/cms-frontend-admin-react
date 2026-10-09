import { expect, test } from '@playwright/test'
import { admin } from './tenants.ts'
import { openSite, realApi, signInThroughTheScreen, unique } from './support.ts'

/**
 * The WordPress-style frame on the REAL flow: the menu is built from the site's real content types,
 * and each entry lists that type only. Titles carry a token of their own, because the tests share
 * one database.
 */

const ORCHARD = 'Orchard Bakery'

test('[UC-BE-06] the menu has an entry per real content type, each listing its own, and Add New makes one of that type', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  await api.createPage({ type: 'page', title: `Menu page ${token}`, slug: `menu-page-${token}` })
  await api.createPage({ type: 'post', title: `Menu post ${token}`, slug: `menu-post-${token}` })

  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  const menu = page.getByRole('navigation', { name: 'Main' })
  await expect(menu.locator('.menu-top')).toHaveText(['Dashboard', 'Pages', 'Posts', 'Sites'])

  await menu.getByRole('link', { name: 'Posts', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Posts' })).toBeVisible()
  await expect(page.getByRole('link', { name: `Menu post ${token}` })).toBeVisible()
  await expect(page.getByRole('link', { name: `Menu page ${token}` })).toHaveCount(0)

  await menu.getByRole('link', { name: 'Pages', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Pages' })).toBeVisible()
  await expect(page.getByRole('link', { name: `Menu page ${token}` })).toBeVisible()
  await expect(page.getByRole('link', { name: `Menu post ${token}` })).toHaveCount(0)

  // Add New under Posts makes a post, at the post type's address.
  await menu.getByRole('link', { name: 'Posts', exact: true }).click()
  await menu.getByRole('link', { name: 'Add New' }).click()
  await page.getByLabel('Title', { exact: true }).fill(`Added post ${token}`)
  await page.getByRole('button', { name: 'Create page' }).click()
  await expect(page.getByText(`/blog/added-post-${token}`)).toBeVisible()
  expect(await api.slugs()).toContain(`added-post-${token}`)
})
