import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { admin } from './tenants.ts'
import { openSite, publicPage, realApi, signInThroughTheScreen, unique } from './support.ts'

/**
 * The Text block on the REAL flow (feature text-block, D-041): written in the real admin, saved and
 * published through the real API, which cleans it, and read back from the public route the website uses.
 */

const ORCHARD = 'Orchard Bakery'
const card = (page: Page, title: string) => page.getByRole('region', { name: title })
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })

test('[UC-TB-05] text written and pasted in the admin is saved, published and served to the website; anything unsafe pasted in is gone', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  const made = await api.createPage({
    type: 'page',
    title: `Story ${token}`,
    slug: `story-${token}`,
  })

  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)
  await page.getByRole('button', { name: 'Add Text' }).click()
  const block = card(page, '1. Text')
  await block.getByRole('textbox', { name: 'Heading' }).fill('Our story')
  const text = block.getByRole('textbox', { name: 'Text' })
  await text.click()
  await page.keyboard.type('We bake ')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type('every')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type(' morning.')
  await page.keyboard.press('Enter')

  // Pasted from somewhere else: the words and the safe link come in, the rest does not.
  await text.evaluate((editor) => {
    const data = new DataTransfer()
    data.setData(
      'text/html',
      '<p style="color:red" onclick="steal()">Find us <a href="https://maps.example.com/orchard">on the map</a>' +
        '<img src="x" onerror="alert(1)"><script>alert(1)</script> or <a href="javascript:alert(1)">here</a>.</p>',
    )
    editor.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  })
  await expect(text).toContainText('Find us on the map or here.')

  await save(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByText('Published.', { exact: true })).toBeVisible()

  const live = await publicPage(request, 'orchard.test', `/story-${token}`)
  expect(live.status).toBe(200)
  expect(live.body.page.blocks).toEqual([
    {
      type: 'richText',
      heading: 'Our story',
      html:
        '<p>We bake <strong>every</strong> morning.</p>' +
        '<p>Find us <a href="https://maps.example.com/orchard">on the map</a> or here.</p>',
    },
  ])

  // Opened again, it reads as saved and nothing counts as changed.
  await page.reload()
  await expect(card(page, '1. Text').getByRole('textbox', { name: 'Text' })).toContainText(
    'We bake every morning.',
  )
  await expect(save(page)).toBeDisabled()
})
