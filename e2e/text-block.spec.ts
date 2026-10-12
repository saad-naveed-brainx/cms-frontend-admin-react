import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeContent, fakePage, signedInAs } from './support/mock-api.ts'

/**
 * The Text block in the editor (feature text-block, D-041): written with a small toolbar, saved as
 * HTML, drawn in the live preview by the website's own component. The API's answers are replaced
 * so the test sees exactly what is sent; the real flow is in e2e/flow/text-block.spec.ts.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']
const card = (page: Page, title: string) => page.getByRole('region', { name: title })
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })
const preview = (page: Page) => page.frameLocator('iframe[title="Live preview of this page"]')

test('[UC-TB-04] a Text block is written with bold, a list and a link, shows in the live preview, and saves as HTML; empty text and an unsafe link are refused', async ({
  page,
}) => {
  const home = fakePage(1, {
    title: 'Home',
    slug: 'home',
    blocks: [{ type: 'hero', headline: 'Hi' }],
  })
  const api = await fakeContent(page, [home])
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${home.id}`)

  await page.getByRole('button', { name: 'Add Text' }).click()
  const block = card(page, '2. Text')
  await expect(block.getByRole('textbox', { name: 'Heading' })).toBeFocused()
  const text = block.getByRole('textbox', { name: 'Text' })
  const tools = block.getByRole('toolbar', { name: 'Text formatting' })

  // No words yet: nothing is sent, and the box says why.
  await save(page).click()
  await expect(text).toHaveAccessibleDescription('Enter the text.')
  await expect(text).toBeFocused()
  expect(api.saved).toEqual([])

  await block.getByRole('textbox', { name: 'Heading' }).fill('Our story')
  await text.click()
  await page.keyboard.type('We bake ')
  await tools.getByRole('button', { name: 'Bold' }).click()
  await expect(tools.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.type('every')
  await tools.getByRole('button', { name: 'Bold' }).click()
  await page.keyboard.type(' morning.')
  await page.keyboard.press('Enter')
  await tools.getByRole('button', { name: 'Bulleted list' }).click()
  await page.keyboard.type('Rye bread')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Seed cake')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')

  // A link that is not safe is explained and not made; a page on the site is.
  page.once('dialog', (dialog) => void dialog.accept('javascript:alert(1)'))
  await tools.getByRole('button', { name: 'Link', exact: true }).click()
  await expect(block.getByRole('alert')).toHaveText(
    'A link must start with https://, / for a page on this site, mailto: or tel:.',
  )
  page.once('dialog', (dialog) => void dialog.accept('/menu'))
  await tools.getByRole('button', { name: 'Link', exact: true }).click()
  await expect(block.getByRole('alert')).toHaveCount(0)

  // The live preview draws it with the website's component, before anything is saved.
  const drawn = preview(page)
  await expect(drawn.getByRole('heading', { name: 'Our story' })).toBeVisible()
  await expect(drawn.locator('strong', { hasText: 'every' })).toBeVisible()
  await expect(drawn.getByRole('listitem')).toHaveText(['Rye bread', 'Seed cake'])
  await expect(drawn.getByRole('link', { name: '/menu' })).toHaveAttribute('href', '/menu')

  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.saved).toEqual([
    {
      blocks: [
        { type: 'hero', headline: 'Hi' },
        {
          type: 'richText',
          heading: 'Our story',
          html:
            '<p>We bake <strong>every</strong> morning.</p>' +
            '<ul><li><p>Rye bread</p></li><li><p>Seed cake</p></li></ul>' +
            '<p><a href="/menu">/menu</a></p>',
        },
      ],
    },
  ])

  // Opened again, the text is there as saved, and nothing counts as changed.
  await page.reload()
  await expect(card(page, '2. Text').getByRole('textbox', { name: 'Text' })).toContainText(
    'We bake every morning.',
  )
  await expect(save(page)).toBeDisabled()
})
