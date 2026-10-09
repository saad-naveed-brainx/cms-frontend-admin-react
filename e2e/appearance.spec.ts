import { expect, test } from '@playwright/test'
import { fakeAppearance, fakeContent, fakePage, signedInAs } from './support/mock-api.ts'

/**
 * The Appearance screen (GOV-04) with the API's answers replaced, for what the real flow
 * (e2e/flow/appearance.spec.ts) cannot see: exactly what Save sends, and the screen for someone who
 * may not change it.
 */

const ADMIN = ['content.create', 'content.edit_any', 'content.publish', 'settings.manage']
const NEW_SITE = { name: 'Orchard Bakery', tagline: '', footerNote: '', theme: {} }
const home = fakePage(1, { title: 'Home', slug: 'home', path: '/home', status: 'published' })

test('[UC-AP-08] Save sends only what changed: the text alone, then the whole theme once a palette is picked', async ({
  page,
}) => {
  await fakeContent(page, [home])
  const api = await fakeAppearance(page, NEW_SITE)
  await signedInAs(page, ADMIN)
  await page.goto('/appearance')

  // A new site shows the default look, and nothing is unsaved.
  await expect(page.getByLabel('Classic blue')).toBeChecked()
  await expect(page.getByText('No unsaved changes.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()

  await page.getByLabel('Tagline').fill('  Baked at five  ')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved. The site shows it now.')).toBeVisible()
  expect(api.saved).toEqual([{ tagline: 'Baked at five' }])

  // "Night", as the website defines it (web/src/site/palettes.ts).
  const night = {
    paper: '#0f1115',
    surface: '#181b21',
    ink: '#eef1f4',
    muted: '#a3acb9',
    line: '#2c313a',
    brand: '#8ab4ff',
    onBrand: '#0f1115',
    accent: '#f2b84b',
  }
  await page.getByLabel('Night').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved. The site shows it now.')).toBeVisible()
  expect(api.saved[1]).toEqual({
    theme: {
      typeSet: 'editorial',
      shape: 'soft',
      density: 'comfortable',
      texture: 'none',
      palette: night,
    },
  })

  // An empty name is refused before anything is sent.
  await page.getByLabel('Site name').fill('  ')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Enter the site’s name.')).toBeVisible()
  await expect(page.getByLabel('Site name')).toBeFocused()
  expect(api.saved).toHaveLength(2)
})

test('[UC-AP-08] someone who may not change the look has no Appearance in the menu, and the screen opened directly is read-only', async ({
  page,
}) => {
  await fakeContent(page, [home])
  await fakeAppearance(page, { ...NEW_SITE, tagline: 'Baked at five' })
  await signedInAs(page, ['content.create', 'content.edit_any'])
  await page.goto('/')
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Appearance' }),
  ).toHaveCount(0)

  await page.goto('/appearance')
  await expect(page.getByText('You can see how this site looks but not change it.')).toBeVisible()
  await expect(page.getByLabel('Tagline')).toHaveValue('Baked at five')
  await expect(page.getByLabel('Tagline')).not.toBeEditable()
  await expect(page.getByLabel('Night')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
})
