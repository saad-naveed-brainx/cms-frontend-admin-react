import { expect, test } from '@playwright/test'
import { flowApiUrl, siteLink } from './env.ts'
import { openSite, realApi, signInThroughTheScreen, unique } from './support.ts'
import { admin, tenants } from './tenants.ts'

/**
 * The Preview button on the REAL flow: the admin asks the real API for a link, and the link it
 * opens is one the real public preview route accepts, for that draft, at that site's address.
 * The website is not running here, so the new tab gets a blank stand-in page.
 */

test('[UC-SP-15] Preview opens a link the real API accepts for that draft at its own site', async ({
  page,
  context,
  request,
}) => {
  const [orchard] = tenants
  const api = await realApi(request, admin, orchard.site)
  const token = unique()
  const made = await api.createPage({ type: 'page', title: `Preview me ${token}`, slug: `preview-${token}` })
  await context.route(`${siteLink(orchard.host, '')}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>The website</title>' }),
  )

  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)
  const opened = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Preview' }).click()
  const tab = await opened
  await expect(tab).toHaveURL(new RegExp(`^${siteLink(orchard.host, `/preview-${token}`)}\\?preview=`))

  const link = new URL(tab.url()).searchParams.get('preview') ?? ''
  const shown = await request.get(
    `${flowApiUrl}/public/preview?host=${orchard.host}&token=${encodeURIComponent(link)}`,
  )
  expect(shown.status()).toBe(200)
  const body = (await shown.json()) as { page: { title: string }; preview: { status: string } }
  expect(body.page.title).toBe(`Preview me ${token}`)
  expect(body.preview.status).toBe('draft')
})
