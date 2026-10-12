import { expect, test } from '@playwright/test'
import { greeter } from './tenants.ts'
import { publicPage, realApi, signInThroughTheScreen } from './support.ts'

/**
 * The front page on the REAL flow (D-037): a site starts with a published Home page, the Pages list
 * marks it, and when it is taken down the Dashboard says so and puts it back. Fern's site is hers
 * alone: the test unpublishes its front page.
 */

const SITE = greeter.tenant.site
const HOST = greeter.tenant.host

test('[UC-FP-07] a new site’s Home page is its front page; taken down, the Dashboard says so and Publish puts it back on the site', async ({
  page,
  request,
}) => {
  const api = await realApi(request, greeter.admin, SITE)
  const home = await api.frontPage()
  expect(home.status).toBe('published')

  await signInThroughTheScreen(page, greeter.admin)
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('region', { name: /front page/ })).toHaveCount(0)
  await page.goto('/pages?type=page')
  await expect(page.getByRole('row', { name: /^Home/ })).toContainText('Home — Front page')

  await api.unpublish(home.id)
  expect((await publicPage(request, HOST)).status).toBe(404)

  await page.goto('/')
  const notice = page.getByRole('region', { name: 'Your front page is not published' })
  await expect(notice).toContainText('Visitors to your site’s address see “Page not found”')
  await notice.getByRole('button', { name: 'Publish the front page' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Front page published. Visitors see it at your site’s address.',
  )

  expect((await api.frontPage()).status).toBe('published')
  const front = await publicPage(request, HOST)
  expect(front.status).toBe(200)
  expect(front.body.page).toMatchObject({
    title: 'Home',
    blocks: [{ type: 'hero', headline: SITE }],
  })
})
