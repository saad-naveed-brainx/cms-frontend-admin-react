import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SAMPLE_PNG } from '../support/mock-api.ts'
import { admin } from './tenants.ts'
import { openSite, realApi, signInThroughTheScreen, unique } from './support.ts'

/**
 * Choosing library pictures on the REAL flow (feature media, MED-03): a picture in the real media
 * library is chosen as the site's logo and in a Hero block, saved through the real API, which keeps
 * both addresses and serves the picture at them.
 */

const MAPLE = 'Maple Books'
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })

test('[UC-MD-11] a library picture chosen as the logo and in a Hero is saved by the real API, which serves it at that address', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, MAPLE)
  const name = `books-${unique()}.png`
  const url = await api.uploadPicture(name, SAMPLE_PNG)
  const served = await request.get(url)
  expect(served.status()).toBe(200)
  expect(served.headers()['content-type']).toBe('image/png')

  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)

  // The logo.
  await page.goto('/appearance')
  await page.getByRole('button', { name: 'Choose a logo' }).click()
  await page
    .getByRole('dialog', { name: 'Choose a logo' })
    .getByRole('button', { name: `Choose ${name}` })
    .click()
  await save(page).click()
  await expect(page.getByText('Saved. The site shows it now.')).toBeVisible()
  expect((await api.getAppearance()).body.logoUrl).toBe(url)

  // The same picture in a Hero.
  const made = await api.createPage({
    type: 'page',
    title: `Shelves ${name}`,
    slug: `shelves-${unique()}`,
    blocks: [{ type: 'hero', headline: 'Rare books' }],
  })
  await page.goto(`/pages/${made.id}`)
  const image = page.getByRole('region', { name: '1. Hero' }).getByRole('group', { name: 'Image' })
  await image.getByRole('button', { name: 'Choose from library' }).click()
  await page
    .getByRole('dialog', { name: 'Choose a picture' })
    .getByRole('button', { name: `Choose ${name}` })
    .click()
  await image.getByLabel('Alt text').fill('A shelf of old books')
  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect((await api.getPage(made.id)).body.blocks).toEqual([
    { type: 'hero', headline: 'Rare books', image: { src: url, alt: 'A shelf of old books' } },
  ])

  // Put Maple Books back as it was for the other tests: no logo.
  await page.goto('/appearance')
  await page.getByRole('button', { name: 'Remove logo' }).click()
  await save(page).click()
  await expect(page.getByText('Saved. The site shows it now.')).toBeVisible()
  expect((await api.getAppearance()).body.logoUrl).toBe('')
})
