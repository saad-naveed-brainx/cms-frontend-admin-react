import { expect, test } from '@playwright/test'
import { SAMPLE_PNG } from '../support/mock-api.ts'
import { flowApiPort } from './env.ts'
import { admin } from './tenants.ts'
import { openSite, realApi, signInThroughTheScreen, unique } from './support.ts'

/**
 * The Media screen on the REAL flow (feature media, D-042): a real upload to the real API, which
 * stores the picture on its disk (a throwaway folder for this run) and serves it back.
 */

test('[UC-MD-06] a picture added on the Media screen is stored by the real API, and its small copy really loads in the grid', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, 'Orchard Bakery')
  const name = `shop-${unique()}.png`

  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Media' }).click()
  await page
    .getByLabel('Add New Media File')
    .setInputFiles({ name, mimeType: 'image/png', buffer: SAMPLE_PNG })
  await expect(page.getByRole('status').filter({ hasText: 'was added' })).toHaveText(
    `${name} was added.`,
  )

  const thumb = page.getByRole('list', { name: 'Pictures' }).getByRole('img', { name })
  await expect(thumb).toHaveAttribute(
    'src',
    // MEDIA_PUBLIC_URL is not set for the flow API, so it is its default: localhost and its port.
    new RegExp(
      `^http://localhost:${flowApiPort}/uploads/${api.siteId}/[0-9a-f-]{36}-thumb\\.webp$`,
    ),
  )
  // Really there: the browser loaded it from the API.
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(96)

  // Still there after a reload: it is the API's list, not the screen's memory.
  await page.reload()
  await expect(
    page.getByRole('list', { name: 'Pictures' }).getByRole('img', { name }),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Pictures' }).getByRole('listitem').first(),
  ).toContainText(`${name}96 × 64`)
})
