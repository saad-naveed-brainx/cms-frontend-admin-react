import { expect, test } from '@playwright/test'
import { fakeContent, fakePage, signedInAs } from './support/mock-api.ts'

/**
 * The search engines box (SEO-01) with the content API's answers replaced, for what the real flow
 * (e2e/flow/seo.spec.ts) cannot see: exactly what Save sends, and the box for someone who may only read.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']

test('[UC-SEO-09] Save sends only the search fields that changed, an emptied one as none', async ({
  page,
}) => {
  const seeded = fakePage(1, {
    title: 'About us',
    seoTitle: 'About Orchard Bakery',
    seoDescription: 'Who bakes your bread.',
  })
  const content = await fakeContent(page, [seeded])
  await signedInAs(page, EVERYTHING)
  await page.goto(`/pages/${seeded.id}`)

  await page.getByLabel('Meta description').fill('  Who bakes your bread, and since when.  ')
  await page.getByLabel('SEO title').fill('')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(content.saved).toEqual([
    { seoTitle: null, seoDescription: 'Who bakes your bread, and since when.' },
  ])

  await page.getByLabel('Hide this page from search engines').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(content.saved[1]).toEqual({ noIndex: true })
})

test('[UC-SEO-09] someone who may only read sees the stored search fields, and none of them can change', async ({
  page,
}) => {
  const readOnly = fakePage(2, { title: 'Contact', seoTitle: 'Find us', noIndex: true })
  await fakeContent(page, [readOnly])
  await signedInAs(page, [])
  await page.goto(`/pages/${readOnly.id}`)
  await expect(page.getByText('You can read this page but not change it.')).toBeVisible()
  await expect(page.getByLabel('SEO title')).toHaveValue('Find us')
  await expect(page.getByLabel('SEO title')).not.toBeEditable()
  await expect(page.getByLabel('Meta description')).not.toBeEditable()
  await expect(page.getByLabel('Hide this page from search engines')).toBeChecked()
  await expect(page.getByLabel('Hide this page from search engines')).toBeDisabled()
})
