import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { admin, finisher } from './tenants.ts'
import { openSite, publicPage, realApi, signInThroughTheScreen, sql, unique } from './support.ts'

/**
 * The block editor on the REAL flow: a real browser, the real admin, the real API and a real
 * database. Pages are made with the real API or through the screens, and what the editor saved is
 * read back from the real API, never taken from the page. Each test uses slugs of its own.
 */

const ORCHARD = 'Orchard Bakery'

const card = (page: Page, title: string) => page.getByRole('region', { name: title })
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })

test('[UC-RS-21] adds a Hero and a Call to action through the editor, and the real API has them as typed, and a reload shows them', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  const made = await api.createPage({
    type: 'page',
    title: `Blocks ${token}`,
    slug: `blocks-${token}`,
  })
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)

  await page.getByRole('button', { name: 'Add Hero' }).click()
  const hero = card(page, '1. Hero')
  await hero.getByLabel('Headline').fill(`Fresh bread ${token}`)
  await hero.getByLabel('Text', { exact: true }).fill('Baked at dawn.')
  await page.getByRole('button', { name: 'Add Call to action' }).click()
  const cta = card(page, '2. Call to action')
  await cta.getByLabel('Heading').fill('Visit us')
  const button = cta.getByRole('group', { name: 'Button' })
  await button.getByLabel('Label').fill('Find the shop')
  await button.getByLabel('Address').fill('/contact')
  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  // What the real API stored: the typed fields only, none of the ones left empty.
  const expected = [
    { type: 'hero', headline: `Fresh bread ${token}`, body: 'Baked at dawn.' },
    { type: 'cta', heading: 'Visit us', action: { label: 'Find the shop', href: '/contact' } },
  ]
  expect((await api.getPage(made.id)).body.blocks).toEqual(expected)

  // A reload brings the same blocks back into the editor.
  await page.reload()
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['1. Hero', '2. Call to action'])
  await expect(card(page, '1. Hero').getByLabel('Headline')).toHaveValue(`Fresh bread ${token}`)
  await expect(
    card(page, '2. Call to action').getByRole('group', { name: 'Button' }).getByLabel('Address'),
  ).toHaveValue('/contact')
  await expect(save(page)).toBeDisabled()
})

test('[UC-RS-22] moves, edits, adds and removes an item and deletes a block, and the real API has exactly that order and content', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  const made = await api.createPage({
    type: 'page',
    title: `Reorder ${token}`,
    slug: `reorder-${token}`,
    blocks: [
      { type: 'hero', headline: 'Welcome' },
      {
        type: 'featureGrid',
        heading: 'Why us',
        items: [
          { title: 'Fast', body: 'Very fast.' },
          { title: 'Cheap', body: 'Very cheap.' },
        ],
      },
      { type: 'cta', heading: 'Join', action: { label: 'Sign up', href: '/join' } },
    ],
  })
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)
  await expect(save(page)).toBeDisabled()

  await page.getByRole('button', { name: 'Move block 1 down' }).click()
  await card(page, '2. Hero').getByLabel('Headline').fill('Welcome back')
  const grid = card(page, '1. Feature grid')
  await grid.getByRole('button', { name: 'Add item' }).click()
  const third = grid.getByRole('group', { name: 'Item 3' })
  await third.getByLabel('Title').fill('Open')
  await third.getByLabel('Text', { exact: true }).fill('Seven days a week.')
  await grid.getByRole('button', { name: 'Remove item 1' }).click()
  await page.getByRole('button', { name: 'Delete block 3' }).click()
  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  expect((await api.getPage(made.id)).body.blocks).toEqual([
    {
      type: 'featureGrid',
      heading: 'Why us',
      items: [
        { title: 'Cheap', body: 'Very cheap.' },
        { title: 'Open', body: 'Seven days a week.' },
      ],
    },
    { type: 'hero', headline: 'Welcome back' },
  ])

  // Saved is saved: a reload has nothing left to save.
  await page.reload()
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['1. Feature grid', '2. Hero'])
  await expect(save(page)).toBeDisabled()
})

test('[UC-RS-23] a page that already holds rich text and an unknown block shows them, keeps them exactly when saved, and the real API refuses new rich text', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  const rich = { type: 'richText', heading: 'Old', html: '<p>Written before the rule</p>' }
  const unknown = { type: 'hologram', note: 'from the future' }
  const made = await api.createPage({
    type: 'page',
    title: `Legacy ${token}`,
    slug: `legacy-${token}`,
    blocks: [{ type: 'hero', headline: 'Hi' }, unknown],
  })
  // From before the API refused rich text: the API will not take one now, so it goes in by SQL.
  sql(
    `UPDATE content SET blocks = '${JSON.stringify([{ type: 'hero', headline: 'Hi' }, rich, unknown])}'::jsonb WHERE id = '${made.id}'`,
  )

  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    '1. Hero',
    '2. Rich text',
    '3. Unknown block',
  ])
  await expect(page.getByRole('button', { name: /^Add Rich text/ })).toHaveCount(0)

  await card(page, '1. Hero').getByLabel('Headline').fill('Hello again')
  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect((await api.getPage(made.id)).body.blocks).toEqual([
    { type: 'hero', headline: 'Hello again' },
    rich,
    unknown,
  ])

  // The real API: the block already there may stay, a changed or a new one is a 400.
  const changed = await api.patchPage(made.id, { blocks: [{ ...rich, html: '<p>Changed</p>' }] })
  expect(changed.status).toBe(400)
  const added = await api.patchPage(made.id, { blocks: [{ type: 'richText', html: '<p>New</p>' }] })
  expect(added.status).toBe(400)
  expect(added.body.errors[0]).toMatch(/^blocks\.0: a richText block/)
  expect((await api.getPage(made.id)).body.blocks).toHaveLength(3)
})

test('[UC-RS-24] the finish line through the screens: sign in, create a site, create a home page, add a block, publish, and the site serves it', async ({
  page,
  request,
}) => {
  const token = unique()
  const siteName = `Finish Cafe ${token}`
  const host = `finish-${token}.localhost`
  const headline = `Welcome to ${siteName}`

  await signInThroughTheScreen(page, finisher.admin)

  // A new site on its own address.
  await page.getByRole('banner').getByRole('link', { name: 'New site' }).click()
  await page.getByLabel('Name', { exact: true }).fill(siteName)
  await page.getByLabel('Web address', { exact: true }).fill(host)
  await page.getByRole('button', { name: 'Create site' }).click()
  await expect(page.getByText('Site created.')).toBeVisible()
  await expect(page.getByText('No pages yet.')).toBeVisible()

  // Its home page.
  await page.getByRole('link', { name: 'Create the first page' }).click()
  await page.getByLabel('Title').fill('Home')
  await expect(page.getByLabel('Slug')).toHaveValue('home')
  await page.getByRole('button', { name: 'Create page' }).click()
  await expect(page.getByText('Page created.')).toBeVisible()

  // Not public until it is published.
  expect((await publicPage(request, host)).status).toBe(404)

  // A block, saved, then published.
  await page.getByRole('button', { name: 'Add Hero' }).click()
  const hero = card(page, '1. Hero')
  await hero.getByLabel('Headline').fill(headline)
  const mainButton = hero.getByRole('group', { name: 'Main button' })
  await mainButton.getByLabel('Label').fill('Visit')
  await mainButton.getByLabel('Address').fill('/visit')
  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByText('Published.', { exact: true })).toBeVisible()

  // What the public site is told at that address: the headline and the site's name.
  const live = await publicPage(request, host)
  expect(live.status).toBe(200)
  expect(live.body.site.name).toBe(siteName)
  expect(live.body.page).toMatchObject({
    title: 'Home',
    path: '/home',
    blocks: [{ type: 'hero', headline, primaryAction: { label: 'Visit', href: '/visit' } }],
  })
})
