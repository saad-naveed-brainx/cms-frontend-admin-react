import { expect, test } from '@playwright/test'
import { flowApiUrl } from './env.ts'
import { historian } from './tenants.ts'
import { openSite, publicPage, realApi, signInThroughTheScreen, unique } from './support.ts'

/**
 * Version history on the REAL API (UC-VH-42, version-history T5): Hana owns a website with a published
 * page. She saves it twice through the screen (a new title, then a new block), opens Versions, looks at
 * the oldest version and presses Restore: the old title is an unsaved change while the website still
 * shows the newer one, and only Save puts it on the website and makes one more version. A Viewer is
 * refused the versions. No other test uses her site.
 */

const { host, site } = historian.tenant
const save = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Save', exact: true })

test('[UC-VH-42] two saves, the oldest version looked at and restored: the history keeps all four, the website changes only on Save, and a Viewer is refused', async ({
  page,
  request,
}) => {
  const api = await realApi(request, historian.admin, site)
  const token = unique()
  const slug = `hours-${token}`
  const original = `Opening hours ${token}`
  const newer = `Opening hours, new ${token}`
  const made = await api.createPage({
    type: 'page',
    title: original,
    slug,
    blocks: [{ type: 'hero', headline: 'Open daily' }],
  })
  await api.publish(made.id)
  const before = (await api.getPage(made.id)).body

  await signInThroughTheScreen(page, historian.admin)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)

  // Two saves through the screen: a new title, then a new block.
  await page.getByLabel('Title', { exact: true }).fill(newer)
  await save(page).click()
  await expect.poll(async () => (await api.getPage(made.id)).body.title).toBe(newer)
  await page.getByRole('button', { name: 'Add Hero' }).click()
  await page.getByRole('region', { name: '2. Hero' }).getByLabel('Headline').fill('Come in')
  await save(page).click()
  await expect.poll(async () => (await api.getPage(made.id)).body.blocks.length).toBe(2)
  expect((await publicPage(request, host, `/${slug}`)).body.page.title).toBe(newer)

  // The Versions screen: the first version and the two saves, newest first, the newest marked.
  await page.getByRole('link', { name: 'Versions', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Versions of ${newer}` })).toBeVisible()
  const rows = page.getByRole('list', { name: 'Saved versions' }).getByRole('button')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('Current version')
  await expect(rows.first()).toContainText(historian.admin.name)

  // Look at the oldest: its title, and its one block drawn, as it was.
  await rows.last().click()
  await expect(page.locator('.facts').getByText(original, { exact: true })).toBeVisible()
  await expect(
    page.frameLocator('iframe[title="Preview of this version"]').getByText('Open daily'),
  ).toBeVisible()

  // Restore: the old title is in the editor as an unsaved change, and the website still shows the newer one.
  await page.getByRole('link', { name: 'Restore this version' }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(original)
  await expect(page.getByText('You have unsaved changes.')).toBeVisible()
  await expect(page.locator('main > p.notice')).toContainText('is loaded. Nothing changes until')
  expect((await publicPage(request, host, `/${slug}`)).body.page.title).toBe(newer)
  expect((await api.getPage(made.id)).body.title).toBe(newer)

  // Save: now the website shows the old title, and the history has one more version.
  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await expect
    .poll(async () => (await publicPage(request, host, `/${slug}`)).body.page.title)
    .toBe(original)
  await page.getByRole('link', { name: 'Versions', exact: true }).click()
  await expect(rows).toHaveCount(4)
  await expect(rows.first()).toContainText('Current version')

  // The real API agrees: four versions, newest first, and the page itself never moved.
  const history = await api.versions(made.id)
  expect(history.total).toBe(4)
  expect(history.items.map((version) => version.title)).toEqual([original, newer, newer, original])
  expect(history.items.map((version) => version.blocks.length)).toEqual([1, 2, 1, 1])
  const after = (await api.getPage(made.id)).body
  expect(after).toMatchObject({
    path: before.path,
    status: 'published',
    publishedAt: before.publishedAt,
    title: original,
  })

  // A Viewer, made through the real invitation routes, is refused the versions.
  const members = (await (
    await request.get(`${flowApiUrl}/members`, { headers: api.headers })
  ).json()) as { roles: { id: string; name: string }[] }
  const invited = await request.post(`${flowApiUrl}/invitations`, {
    headers: api.headers,
    data: {
      email: `vic-${token}@history.test`,
      roleId: members.roles.find((role) => role.name === 'Viewer')?.id,
    },
  })
  expect(invited.status()).toBe(201)
  const joined = await request.post(`${flowApiUrl}/invitations/accept`, {
    data: {
      token: ((await invited.json()) as { token: string }).token,
      name: 'Vic Viewer',
      password: 'a long enough password',
    },
  })
  expect(joined.status()).toBe(200)
  const vic = {
    Authorization: `Bearer ${((await joined.json()) as { accessToken: string }).accessToken}`,
    'X-Site-Id': api.siteId,
  }
  const list = await request.get(`${flowApiUrl}/content/${made.id}/versions`, { headers: vic })
  expect(list.status()).toBe(403)
  const one = await request.get(
    `${flowApiUrl}/content/${made.id}/versions/${history.items[0].id}`,
    {
      headers: vic,
    },
  )
  expect(one.status()).toBe(403)
  // ...and the page itself is still theirs to read, so the refusal is about versions, not the site.
  expect((await request.get(`${flowApiUrl}/content/${made.id}`, { headers: vic })).status()).toBe(
    200,
  )
})
