import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { siteLink } from './flow/env.ts'
import {
  SESSION_KEY,
  fakeContent,
  fakePage,
  fulfill,
  inDays,
  orchard,
  profileBody,
  seedStorage,
  signedInAs,
} from './support/mock-api.ts'

/**
 * The Preview button (feature site-preview): it asks the API for a preview link and opens the
 * page, as saved, at its site's own address in a new tab. The API's answers are replaced; the real
 * flow is in e2e/flow/preview.spec.ts.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']
const draft = fakePage(1, { title: 'Spring menu', slug: 'spring' })

/** The website is not running in these tests: whatever opens there gets a blank page. */
const stubTheWebsite = (context: BrowserContext) =>
  context.route('http://orchard.test:3000/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>The website</title>' }),
  )

/** The content API, with `POST /content/:id/preview` answered by `answer`. */
async function withPreviewAnswer(page: Page, answer: (route: import('@playwright/test').Route) => void) {
  const api = await fakeContent(page, [draft])
  api.override = (route, request) => {
    if (request.method() !== 'POST' || !new URL(request.url()).pathname.endsWith('/preview')) return false
    answer(route)
    return true
  }
  return api
}

test('[UC-SP-13] Preview opens the page as saved at its site’s address, with the link the API gave, and waits for unsaved changes', async ({
  page,
  context,
}) => {
  await stubTheWebsite(context)
  const api = await withPreviewAnswer(page, (route) =>
    void fulfill(route, 200, { token: 'link.from.api', expiresAt: inDays(1) }),
  )
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${draft.id}`)

  const opened = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Preview' }).click()
  const tab = await opened
  await expect(tab).toHaveURL(`${siteLink('orchard.test', '/spring')}?preview=link.from.api`)
  expect(api.calls).toContain(`POST /content/${draft.id}/preview`)
  // The website gets no hold on the admin.
  expect(await tab.evaluate(() => window.opener)).toBeNull()

  // A preview shows what is saved, so unsaved changes come first.
  await page.getByLabel('Title', { exact: true }).fill('Spring menu, second go')
  await expect(page.getByRole('button', { name: 'Preview' })).toBeDisabled()
})

test('[UC-SP-14] if no link can be had, the tab closes and the screen says so', async ({ page, context }) => {
  await stubTheWebsite(context)
  await withPreviewAnswer(page, (route) => void fulfill(route, 500, { message: 'Internal server error' }))
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${draft.id}`)

  const opened = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Preview' }).click()
  const tab = await opened
  await expect(page.getByRole('alert')).toHaveText('Something went wrong. Try again.')
  await expect.poll(() => tab.isClosed()).toBe(true)
})

test('[UC-SP-14] someone who may only read can still preview, and a site with no address offers no Preview', async ({
  page,
}) => {
  await withPreviewAnswer(page, (route) => void fulfill(route, 200, { token: 't', expiresAt: inDays(1) }))
  await signedInAs(page, [])
  await page.goto(`/pages/${draft.id}`)
  await expect(page.getByText('You can read this page but not change it.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview' })).toBeEnabled()

  const noAddress = { ...orchard, site: { ...orchard.site, primaryHost: null }, permissions: EVERYTHING }
  await page.route('**/auth/me', (route) => fulfill(route, 200, profileBody([noAddress])))
  await seedStorage(page, {
    [SESSION_KEY]: JSON.stringify({ accessToken: 'saved-token', expiresAt: inDays(1) }),
  })
  await page.goto(`/pages/${draft.id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Spring menu' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview' })).toHaveCount(0)
})
