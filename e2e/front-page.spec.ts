import { expect, test } from '@playwright/test'
import {
  fakeContent,
  fakePage,
  fulfill,
  postType,
  signedInAs,
  typeRef,
} from './support/mock-api.ts'

/**
 * The front page notice (D-037) in states the real API cannot be made to produce on demand: a site
 * with no page at /home (every site now starts with one), a role without `content.publish`, and a
 * check or a create that fails. The real flow is in e2e/flow/front-page.spec.ts.
 */

const ADMINISTRATOR = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']
const NO_FRONT = 'Your site has no front page'
const NOT_PUBLISHED = 'Your front page is not published'

test('[UC-FP-03] a site with no front page is told so on the Dashboard, and one click makes it: Home, the site name in a hero, published', async ({
  page,
}) => {
  const api = await fakeContent(page, [fakePage(1, { title: 'About', slug: 'about' })])
  await signedInAs(page, ADMINISTRATOR)
  await page.goto('/')

  const notice = page.getByRole('region', { name: NO_FRONT })
  await expect(notice).toContainText('Visitors to your site’s address see “Page not found”.')
  await notice.getByRole('button', { name: 'Create the front page' }).click()

  await expect(page.getByRole('status')).toHaveText('Front page created and published.')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Home')
  const [made] = api.pages
  expect(made).toMatchObject({
    title: 'Home',
    slug: 'home',
    path: '/home',
    status: 'published',
    blocks: [{ type: 'hero', headline: 'Orchard Bakery' }],
  })
  expect(api.calls.filter((call) => call.startsWith('POST'))).toEqual([
    'POST /content',
    `POST /content/${made.id}/publish`,
  ])

  // Back on the Dashboard all is well, so nothing is said.
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('region', { name: NO_FRONT })).toHaveCount(0)
})

test('[UC-FP-04] a front page that is not published: the Pages list says so and marks it, and Publish makes it live there', async ({
  page,
}) => {
  const api = await fakeContent(page, [
    fakePage(1, { title: 'About', slug: 'about', status: 'published' }),
    fakePage(2, { title: 'Home', slug: 'home' }),
  ])
  await signedInAs(page, ADMINISTRATOR)
  await page.goto('/pages?type=page')

  const home = page.getByRole('row', { name: /^Home/ })
  await expect(home).toContainText('Home — Draft, Front page')
  await expect(page.getByRole('row', { name: /^About/ })).not.toContainText('Front page')

  const notice = page.getByRole('region', { name: NOT_PUBLISHED })
  await expect(notice).toContainText('until it is published')
  await expect(notice.getByRole('link', { name: 'Edit it' })).toHaveAttribute(
    'href',
    `/pages/${api.pages[1].id}`,
  )
  await notice.getByRole('button', { name: 'Publish the front page' }).click()

  // The list reloads behind it ("Loading pages…" is a status too), so the message is found by its words.
  await expect(
    page.getByText('Front page published. Visitors see it at your site’s address.'),
  ).toBeVisible()
  await expect(home).toContainText('Home — Front page')
  await expect(home).not.toContainText('Draft')
  expect(api.pages[1].status).toBe('published')
})

test('[UC-FP-05] with a published front page nothing is said, the row is marked, and a list of posts has no notice', async ({
  page,
}) => {
  await fakeContent(page, [fakePage(1, { title: 'Home', slug: 'home', status: 'published' })])
  await signedInAs(page, ADMINISTRATOR)

  await page.goto('/pages')
  await expect(page.getByRole('row', { name: /^Home/ })).toContainText('Home — Front page')
  await expect(page.getByRole('region', { name: /front page/ })).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('region', { name: /front page/ })).toHaveCount(0)

  // A posts list never shows the notice, even on a site without a front page.
  await fakeContent(page, [
    fakePage(2, { title: 'News', slug: 'news', type: typeRef(postType), path: '/blog/news' }),
  ])
  await page.goto('/pages?type=post')
  await expect(page.getByRole('link', { name: 'News' })).toBeVisible()
  await expect(page.getByRole('region', { name: /front page/ })).toHaveCount(0)
})

test('[UC-FP-06] without content.publish the notice asks for someone who can; a failed check says nothing; a failed create says so', async ({
  page,
}) => {
  const api = await fakeContent(page, [fakePage(1, { title: 'Home', slug: 'home' })])
  const session = await signedInAs(page, ['content.create', 'content.edit_any'])
  await page.goto('/')
  const notPublished = page.getByRole('region', { name: NOT_PUBLISHED })
  await expect(notPublished).toContainText(
    'Ask someone who can publish pages on this site to publish it.',
  )
  await expect(notPublished.getByRole('button')).toHaveCount(0)
  await expect(notPublished.getByRole('link', { name: 'Edit it' })).toBeVisible()

  api.pages.length = 0
  await page.reload()
  const none = page.getByRole('region', { name: NO_FRONT })
  await expect(none).toContainText('Ask someone who can publish pages on this site to create it.')
  await expect(none.getByRole('button')).toHaveCount(0)

  // The check itself fails: no notice at all.
  session.memberships[0].permissions = ADMINISTRATOR
  api.override = (route, request) => {
    if (!new URL(request.url()).searchParams.has('path')) return false
    void fulfill(route, 500, { message: 'Internal server error' })
    return true
  }
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('region', { name: /front page/ })).toHaveCount(0)

  // The create fails: the reason, and the button to try again.
  api.override = (route, request) => {
    if (request.method() !== 'POST') return false
    void fulfill(route, 500, { message: 'Internal server error' })
    return true
  }
  await page.reload()
  await page.getByRole('button', { name: 'Create the front page' }).click()
  await expect(page.getByRole('alert')).toHaveText('Couldn’t create the front page. Try again.')
  await expect(page.getByRole('button', { name: 'Create the front page' })).toBeEnabled()
  expect(api.pages).toEqual([])
})
