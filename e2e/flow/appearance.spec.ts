import { expect, test } from '@playwright/test'
import { stylist } from './tenants.ts'
import { realApi, signInThroughTheScreen } from './support.ts'

/**
 * The Appearance screen on the REAL flow (GOV-04): a real browser, the real admin, the real API and
 * database. The site's administrator changes its name, tagline, footer note and look, watches the
 * preview (the website's own header, home page and footer) follow, saves, and the real API has it.
 * Sam's site is hers alone: the test renames it.
 */

const SITE = stylist.tenant.site
/** The default theme's brand colour, and the "Harbour green" palette, as the website defines them (web/src/site). */
const DEFAULT_BRAND = '#1f4fd8'
const HARBOUR = {
  paper: '#f3f1ea',
  surface: '#ffffff',
  ink: '#13201c',
  muted: '#4f5d58',
  line: '#d3cdbf',
  brand: '#0f5c4d',
  onBrand: '#ffffff',
  accent: '#9a3f12',
}

/** `#13201C` is `rgb(19, 32, 28)`, as the browser reports it. */
function asRgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

test('[UC-AP-07] changes the name, tagline, footer note, palette, brand and accent colours and fonts, watches the preview follow, and Save stores it', async ({
  page,
  request,
}) => {
  const api = await realApi(request, stylist.admin, SITE)
  const home = await api.createPage({
    type: 'page',
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        type: 'hero',
        headline: 'Made to measure',
        primaryAction: { label: 'Book a fitting', href: '/fittings' },
      },
    ],
  })
  const about = await api.createPage({ type: 'page', title: 'About', slug: 'about' })
  await api.publish(home.id)
  await api.publish(about.id)

  await signInThroughTheScreen(page, stylist.admin)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Appearance' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Appearance' })).toBeVisible()
  await expect(page.getByLabel('Site name')).toHaveValue(SITE)
  await expect(page.getByLabel('Classic blue')).toBeChecked()

  // The preview is the website's own header, home page and footer.
  const preview = page.frameLocator('iframe[title="Live preview of the site"]')
  const button = preview.getByRole('link', { name: 'Book a fitting' })
  await expect(preview.getByRole('banner')).toContainText(SITE)
  await expect(preview.getByRole('banner')).toContainText('About')
  await expect(preview.getByRole('heading', { name: 'Made to measure' })).toBeVisible()
  await expect(button).toHaveCSS('background-color', asRgb(DEFAULT_BRAND))

  await page.getByLabel('Site name').fill('Style House & Co')
  await page.getByLabel('Tagline').fill('Tailoring since 1990')
  await page.getByLabel('Footer note').fill('3 Mill Lane · By appointment')
  await page.getByLabel('Harbour green').check()
  await expect(preview.getByRole('banner')).toContainText('Style House & Co')
  await expect(preview.getByRole('banner')).toContainText('Tailoring since 1990')
  await expect(preview.getByRole('contentinfo')).toContainText('3 Mill Lane · By appointment')
  await expect(button).toHaveCSS('background-color', asRgb(HARBOUR.brand))

  // A light brand colour gets dark text on its buttons, chosen for it.
  await page.getByLabel('Brand colour').fill('#f2c230')
  await expect(button).toHaveCSS('background-color', 'rgb(242, 194, 48)')
  await expect(button).toHaveCSS('color', 'rgb(17, 17, 17)')

  // A faint accent is allowed, with a warning.
  await page.getByLabel('Accent colour').fill('#e8dcc8')
  await expect(page.getByText(/^Hard to read: small text in this colour/)).toBeVisible()

  await page.getByLabel('Technical').check()
  await page.getByLabel('Sharp').check()
  await expect(button).toHaveCSS('border-radius', '0px')

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved. The site shows it now.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()

  const stored = await api.getAppearance()
  expect(stored.body).toEqual({
    name: 'Style House & Co',
    tagline: 'Tailoring since 1990',
    footerNote: '3 Mill Lane · By appointment',
    theme: {
      typeSet: 'technical',
      shape: 'sharp',
      density: 'comfortable',
      texture: 'none',
      palette: { ...HARBOUR, brand: '#f2c230', onBrand: '#111111', accent: '#e8dcc8' },
    },
  })
  // The top bar names the site by its new name at once.
  await expect(page.locator('.adminbar')).toContainText('Style House & Co')

  await page.reload()
  await expect(page.getByLabel('Harbour green')).toBeChecked()
  await expect(page.getByLabel('Tagline')).toHaveValue('Tailoring since 1990')
  await expect(page.getByLabel('Brand colour')).toHaveValue('#f2c230')
})
