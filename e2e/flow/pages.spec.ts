import { expect, test } from '@playwright/test'
import { admin, solo } from './tenants.ts'
import { openSite, realApi, signInThroughTheScreen, unique } from './support.ts'

/**
 * The page screens on the REAL flow: a real browser, the real admin, the real API with its content
 * routes, and a real database. Pages are made with the real API or through the screens, never
 * written into the page. Each test uses titles and slugs of its own, because the tests share one
 * database; the paging test uses a site no other test touches.
 */

const ORCHARD = 'Orchard Bakery'
const MAPLE = 'Maple Books'

const pagesLink = (page: import('@playwright/test').Page) =>
  page.getByRole('link', { name: 'Pages', exact: true })

test('[UC-CS-01] creates a page through the screen, and the real API has it', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)

  await pagesLink(page).click()
  await page.getByRole('link', { name: 'New page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'New page' })).toBeVisible()
  await expect(page.getByLabel('Type')).toHaveValue('page')

  await page.getByLabel('Title').fill(`About us ${token}`)
  await expect(page.getByLabel('Slug')).toHaveValue(`about-us-${token}`)
  await expect(page.getByText(`Address: /about-us-${token}`)).toBeVisible()
  await page.getByRole('button', { name: 'Create page' }).click()

  await expect(page).toHaveURL(/\/pages\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: `About us ${token}` })).toBeVisible()
  await expect(page.getByText('Page created.')).toBeVisible()
  const facts = page.locator('dl.facts')
  await expect(facts).toContainText(`/about-us-${token}`)
  await expect(facts).toContainText('Draft')

  const id = page.url().split('/').pop() ?? ''
  const stored = await api.getPage(id)
  expect(stored.status).toBe(200)
  expect(stored.body).toMatchObject({
    title: `About us ${token}`,
    path: `/about-us-${token}`,
    status: 'draft',
    type: { slug: 'page' },
  })

  await page.getByRole('link', { name: '← Pages' }).click()
  await expect(page.getByRole('link', { name: `About us ${token}` })).toBeVisible()
})

test("[UC-CS-02] a post's address carries the blog prefix, before and after creating it", async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)

  await page.goto('/pages/new')
  await page.getByLabel('Type').selectOption('post')
  await page.getByLabel('Title').fill(`Hello world ${token}`)
  await expect(page.getByText(`Address: /blog/hello-world-${token}`)).toBeVisible()
  await page.getByRole('button', { name: 'Create page' }).click()

  await expect(page).toHaveURL(/\/pages\/[0-9a-f-]{36}$/)
  await expect(page.locator('dl.facts')).toContainText(`/blog/hello-world-${token}`)
  await expect(page.locator('dl.facts')).toContainText('Post')
})

test('[UC-CS-03] lists the real pages of a site, last changed first, with paging and filters', async ({
  page,
  request,
}) => {
  // Seventeen pages and ten posts, made through the real API in this order: the last made is listed first.
  const api = await realApi(request, solo.admin, solo.tenant.site)
  for (let n = 1; n <= 17; n += 1) {
    await api.createPage({ type: 'page', title: `Page ${n}`, slug: `page-${n}` })
  }
  for (let n = 1; n <= 10; n += 1) {
    await api.createPage({ type: 'post', title: `Post ${n}`, slug: `post-${n}` })
  }

  await signInThroughTheScreen(page, solo.admin)
  await pagesLink(page).click()
  const items = page.locator('ul.pages li')

  await expect(page.getByText('Showing 1–25 of 27')).toBeVisible()
  await expect(items).toHaveCount(25)
  await expect(items.first()).toContainText('Post 10')
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/offset=25/)
  await expect(page.getByText('Showing 26–27 of 27')).toBeVisible()
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText('Page 2')
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()

  // The address holds the place: a reload shows the same page of the list.
  await page.reload()
  await expect(page.getByText('Showing 26–27 of 27')).toBeVisible()
  await page.getByRole('button', { name: 'Previous' }).click()
  await expect(page.getByText('Showing 1–25 of 27')).toBeVisible()

  // A filter narrows the list, starts again from the first page, and is in the address too.
  await page.getByLabel('Type').selectOption('post')
  await expect(page).toHaveURL(/type=post/)
  await expect(page).not.toHaveURL(/offset/)
  await expect(page.getByText('Showing 1–10 of 10')).toBeVisible()
  await page.getByLabel('Status').selectOption('published')
  await expect(page.getByText('No pages match these filters.')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Type')).toHaveValue('post')
  await expect(page.getByLabel('Status')).toHaveValue('published')
  await expect(page.getByText('No pages match these filters.')).toBeVisible()
})

test('[UC-CS-04] changes a title through the screen, and the real API, the list and a reload agree', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  const made = await api.createPage({
    type: 'page',
    title: `Old title ${token}`,
    slug: `edit-${token}`,
  })
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)

  await page.goto(`/pages/${made.id}`)
  const title = page.getByLabel('Title')
  const save = page.getByRole('button', { name: 'Save' })
  await expect(title).toHaveValue(`Old title ${token}`)
  await expect(save).toBeDisabled()

  await title.fill(`New title ${token}`)
  await save.click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: `New title ${token}` })).toBeVisible()

  const stored = await api.getPage(made.id)
  expect(stored.body).toMatchObject({ title: `New title ${token}`, path: `/edit-${token}` })

  await page.reload()
  await expect(page.getByLabel('Title')).toHaveValue(`New title ${token}`)
  await page.getByRole('link', { name: '← Pages' }).click()
  await expect(page.getByRole('link', { name: `New title ${token}` })).toBeVisible()
})

test('[UC-CS-05] a taken address is shown on the slug, and nothing is created', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  await api.createPage({ type: 'page', title: 'First', slug: `taken-${token}` })
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)

  await page.goto('/pages/new')
  await page.getByLabel('Title').fill(`Taken ${token}`)
  await expect(page.getByLabel('Slug')).toHaveValue(`taken-${token}`)
  await page.getByRole('button', { name: 'Create page' }).click()

  await expect(page.getByLabel('Slug')).toHaveAccessibleDescription(
    'That address is already used by another page.',
  )
  await expect(page).toHaveURL(/\/pages\/new$/)
  await expect(page.getByLabel('Title')).toHaveValue(`Taken ${token}`)
  const slugs = await api.slugs()
  expect(slugs.filter((slug) => slug === `taken-${token}`)).toHaveLength(1)
})

test('[UC-CS-06] pages belong to one site: another site does not list them or open them', async ({
  page,
  request,
}) => {
  const orchard = await realApi(request, admin, ORCHARD)
  const maple = await realApi(request, admin, MAPLE)
  const token = unique()
  const made = await orchard.createPage({
    type: 'page',
    title: `Orchard only ${token}`,
    slug: `orchard-only-${token}`,
  })

  await signInThroughTheScreen(page)
  await openSite(page, orchard.siteId)
  await page.goto(`/pages/${made.id}`)
  await expect(page.getByRole('heading', { level: 1, name: `Orchard only ${token}` })).toBeVisible()

  // Changing site on a page's screen leaves it for the list, which is the other site's own.
  await page.getByLabel('Site').selectOption(maple.siteId)
  await expect(page).toHaveURL(/\/pages$/)
  await expect(page.getByText('No pages yet.')).toBeVisible()

  // The first site's page is not on this one, even by its address.
  await page.goto(`/pages/${made.id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to pages' }).click()
  await expect(page.getByText('No pages yet.')).toBeVisible()
})

test('[UC-RS-06] publishes and unpublishes a page through the screen, and the real API agrees', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  const made = await api.createPage({
    type: 'page',
    title: `Launch ${token}`,
    slug: `launch-${token}`,
  })
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)

  await page.goto(`/pages/${made.id}`)
  const facts = page.locator('dl.facts')
  await expect(facts).toContainText('Draft')

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByText('Published.', { exact: true })).toBeVisible()
  await expect(facts).toContainText('Published')
  expect((await api.getPage(made.id)).body).toMatchObject({ status: 'published' })

  await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
  await expect(page.getByText('Unpublished.', { exact: true })).toBeVisible()
  await expect(facts).toContainText('Draft')
  expect((await api.getPage(made.id)).body).toMatchObject({ status: 'draft', publishedAt: null })
})
