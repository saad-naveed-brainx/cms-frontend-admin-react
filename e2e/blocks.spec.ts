import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeContent, fakePage, fulfill, signedInAs } from './support/mock-api.ts'

/**
 * The block editor on the edit screen, with the content API's answers replaced so each test can
 * see exactly what is sent when the page is saved. The real flow is in e2e/flow/blocks.spec.ts.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']

const card = (page: Page, title: string) => page.getByRole('region', { name: title })
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })

test('[UC-RS-21] adds a Hero and a Call to action, fills them and saves, leaving empty fields out', async ({
  page,
}) => {
  const home = fakePage(1, { title: 'Home', slug: 'home' })
  const api = await fakeContent(page, [home])
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${home.id}`)

  await expect(page.getByText('No blocks yet. Add one below.')).toBeVisible()
  await expect(save(page)).toBeDisabled()

  await page.getByRole('button', { name: 'Add Hero' }).click()
  const hero = card(page, '1. Hero')
  await expect(hero.getByLabel('Eyebrow')).toBeFocused()
  // Something unsaved: Save is on, and publishing waits for it (publishing would not include it).
  await expect(save(page)).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
  await expect(page.getByText('Save your changes first.')).toBeVisible()

  // The headline cannot be left empty: nothing is sent.
  await save(page).click()
  await expect(hero.getByLabel('Headline')).toHaveAccessibleDescription('Enter the headline.')
  await expect(hero.getByLabel('Headline')).toBeFocused()
  expect(api.saved).toEqual([])

  await hero.getByLabel('Headline').fill('Fresh bread, every morning')
  await hero.getByLabel('Text', { exact: true }).fill('  Baked at dawn.  ')
  await page.getByRole('button', { name: 'Add Call to action' }).click()
  const cta = card(page, '2. Call to action')
  await cta.getByLabel('Heading').fill('Visit us')
  const button = cta.getByRole('group', { name: 'Button' })
  await button.getByLabel('Label').fill('Find the shop')
  await button.getByLabel('Address').fill('/contact')
  await save(page).click()

  await expect(page.getByText('Saved.')).toBeVisible()
  // Only the blocks changed, so only they are sent; text is trimmed and what was left empty is not there.
  expect(api.saved).toEqual([
    {
      blocks: [
        { type: 'hero', headline: 'Fresh bread, every morning', body: 'Baked at dawn.' },
        {
          type: 'cta',
          heading: 'Visit us',
          action: { label: 'Find the shop', href: '/contact' },
        },
      ],
    },
  ])
  await expect(save(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled()
})

test('[UC-RS-21] a link needs a label and a safe address and an image needs alt text: each is explained next to its field, and nothing is sent', async ({
  page,
}) => {
  const home = fakePage(1, { blocks: [{ type: 'hero', headline: 'Welcome' }] })
  const api = await fakeContent(page, [home])
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${home.id}`)

  const hero = card(page, '1. Hero')
  const mainButton = hero.getByRole('group', { name: 'Main button' })
  const image = hero.getByRole('group', { name: 'Image' })

  // A label with no address.
  await mainButton.getByLabel('Label').fill('Order now')
  await save(page).click()
  await expect(mainButton.getByLabel('Address')).toHaveAccessibleDescription('Enter the address.')
  await expect(mainButton.getByLabel('Address')).toBeFocused()

  // An address that is not safe to link to.
  await mainButton.getByLabel('Address').fill('javascript:alert(1)')
  await save(page).click()
  await expect(mainButton.getByLabel('Address')).toHaveAccessibleDescription(
    'Start with https://, / for a page on this site, mailto: or tel:.',
  )

  // An image with no alt text.
  await mainButton.getByLabel('Address').fill('/shop')
  await image.getByLabel('Image address').fill('https://example.com/loaf.jpg')
  await save(page).click()
  await expect(image.getByLabel('Alt text')).toHaveAccessibleDescription('Enter the alt text.')
  await expect(image.getByLabel('Alt text')).toBeFocused()
  expect(api.saved).toEqual([])

  await image.getByLabel('Alt text').fill('A loaf of bread')
  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.saved).toEqual([
    {
      blocks: [
        {
          type: 'hero',
          headline: 'Welcome',
          primaryAction: { label: 'Order now', href: '/shop' },
          image: { src: 'https://example.com/loaf.jpg', alt: 'A loaf of bread' },
        },
      ],
    },
  ])
})

test('[UC-RS-22] moves a block, edits a field, adds and removes an item and deletes a block, and saves exactly that', async ({
  page,
}) => {
  const home = fakePage(1, {
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
  const api = await fakeContent(page, [home])
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${home.id}`)
  // Nothing was touched, so there is nothing to save.
  await expect(save(page)).toBeDisabled()

  // Move the hero down: the Feature grid comes first, and the cursor stays on the hero's own button.
  await page.getByRole('button', { name: 'Move block 1 down' }).click()
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    '1. Feature grid',
    '2. Hero',
    '3. Call to action',
  ])
  await expect(page.getByRole('button', { name: 'Move block 2 down' })).toBeFocused()

  await card(page, '2. Hero').getByLabel('Headline').fill('Welcome back')

  const grid = card(page, '1. Feature grid')
  await grid.getByRole('button', { name: 'Add item' }).click()
  const third = grid.getByRole('group', { name: 'Item 3' })
  await third.getByLabel('Title', { exact: true }).fill('Open')
  await third.getByLabel('Text', { exact: true }).fill('Seven days a week.')
  await grid.getByRole('button', { name: 'Remove item 1' }).click()
  await expect(grid.getByRole('group', { name: /^Item \d$/ })).toHaveCount(2)

  await page.getByRole('button', { name: 'Delete block 3' }).click()
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['1. Feature grid', '2. Hero'])

  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.saved).toEqual([
    {
      blocks: [
        {
          type: 'featureGrid',
          heading: 'Why us',
          items: [
            { title: 'Cheap', body: 'Very cheap.' },
            { title: 'Open', body: 'Seven days a week.' },
          ],
        },
        { type: 'hero', headline: 'Welcome back' },
      ],
    },
  ])
})

test('[UC-RS-23] a block the editor cannot edit is shown, not offered, and kept exactly when the page is saved', async ({
  page,
}) => {
  const rich = { type: 'richText', heading: 'Old', html: '<p>Hello</p>' }
  const unknown = { type: 'hologram', note: 'from the future', depth: 3 }
  const home = fakePage(1, { blocks: [{ type: 'hero', headline: 'Hi' }, rich, unknown] })
  const api = await fakeContent(page, [home])
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${home.id}`)

  // Shown by name, with nothing to edit, and not among the blocks that can be added.
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    '1. Hero',
    '2. Rich text',
    '3. Unknown block',
  ])
  for (const title of ['2. Rich text', '3. Unknown block']) {
    await expect(card(page, title).getByText('This block cannot be edited here.')).toBeVisible()
    await expect(card(page, title).getByRole('textbox')).toHaveCount(0)
  }
  await expect(page.getByRole('button', { name: /^Add Rich text/ })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Add a block' }).getByRole('button')).toHaveText([
    'Add Hero',
    'Add Image and text',
    'Add Feature grid',
    'Add Testimonial',
    'Add Call to action',
  ])
  // Looking at them changed nothing.
  await expect(save(page)).toBeDisabled()

  // Saving another edit sends them back untouched, in place.
  await card(page, '1. Hero').getByLabel('Headline').fill('Hello again')
  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.saved).toEqual([
    { blocks: [{ type: 'hero', headline: 'Hello again' }, rich, unknown] },
  ])

  // They can be moved like any block.
  await page.getByRole('button', { name: 'Move block 2 up' }).click()
  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.saved[1]).toEqual({
    blocks: [rich, { type: 'hero', headline: 'Hello again' }, unknown],
  })
})

test('[UC-RS-23] a refusal from the API is shown plainly, and what was typed stays', async ({
  page,
}) => {
  const home = fakePage(1, { blocks: [{ type: 'hero', headline: 'Welcome' }] })
  const api = await fakeContent(page, [home])
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${home.id}`)
  api.override = (route, request) => {
    if (request.method() !== 'PATCH') return false
    void fulfill(route, 400, {
      message: 'Invalid request',
      errors: ['blocks.0: a richText block is not accepted yet'],
    })
    return true
  }

  await card(page, '1. Hero').getByLabel('Headline').fill('Changed')
  await save(page).click()
  await expect(page.getByRole('alert')).toContainText('a richText block is not accepted yet')
  await expect(card(page, '1. Hero').getByLabel('Headline')).toHaveValue('Changed')
  await expect(save(page)).toBeEnabled()
})

test('[UC-RS-21] someone who may read a page but not change it sees its blocks by name and no editor', async ({
  page,
}) => {
  const home = fakePage(1, {
    blocks: [
      { type: 'hero', headline: 'Welcome' },
      { type: 'cta', heading: 'Join', action: { label: 'Sign up', href: '/join' } },
    ],
  })
  await fakeContent(page, [home])
  await signedInAs(page, [])
  await page.goto(`/pages/${home.id}`)

  await expect(page.getByText('You can read this page but not change it.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Blocks' }).getByRole('listitem')).toHaveText([
    'Hero',
    'Call to action',
  ])
  await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(0)
  await expect(save(page)).toHaveCount(0)
})
