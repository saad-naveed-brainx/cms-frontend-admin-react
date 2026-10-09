import { expect, test } from '@playwright/test'
import { openSite, realApi, signInThroughTheScreen, sql, unique } from './support.ts'
import { admin, tenants } from './tenants.ts'

/**
 * The live preview on the REAL flow: the page and its blocks come from the real API, and the
 * site's theme from the real sign-in. Nothing in the API sets a theme yet, so it is written to the
 * database before signing in, as the website's tests do.
 */

test('[UC-LP-04] a real page draws in the preview with its real site’s theme, and follows the forms', async ({
  page,
  request,
}) => {
  const [orchard] = tenants
  const api = await realApi(request, admin, orchard.site)
  const token = unique()
  const made = await api.createPage({
    type: 'page',
    title: `Live ${token}`,
    slug: `live-${token}`,
    blocks: [{ type: 'hero', headline: `Baked at dawn ${token}` }],
  })
  sql(
    `UPDATE sites SET theme = '{"palette":{"paper":"#f4efe6"}}'::jsonb WHERE id = '${api.siteId}'`,
  )

  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)

  const preview = page.frameLocator('iframe[title="Live preview of this page"]')
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText(`Baked at dawn ${token}`)
  await expect(preview.locator('div[style*="--site-paper"]').first()).toHaveCSS(
    'background-color',
    'rgb(244, 239, 230)',
  )

  await page.getByLabel('Headline').fill(`Still warm ${token}`)
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText(`Still warm ${token}`)
})
