import { expect, test } from '@playwright/test'
import { typer } from './tenants.ts'
import { openSite, realApi, signInThroughTheScreen } from './support.ts'

/**
 * Making a content type on the REAL flow (feature content-types, D-043): made on the screen, it gets
 * its menu entry, and an item made from that entry lives at its address in the real API. Tia has a
 * site of her own, since a new type changes the site's menu.
 */

test('[UC-CT-05] a type made on the Content types screen gets its menu entry, and an item made from Add New is at its address in the real API', async ({
  page,
  request,
}) => {
  const api = await realApi(request, typer.admin, typer.tenant.site)
  await signInThroughTheScreen(page, typer.admin)
  await openSite(page, api.siteId)

  const menu = page.getByRole('navigation', { name: 'Main' })
  await menu.getByRole('link', { name: 'Content types' }).click()
  await page.getByLabel('Name').fill('Recipe')
  await expect(page.getByLabel('Address')).toHaveValue('recipes')
  await page.getByRole('button', { name: 'Make content type' }).click()
  await expect(page.getByRole('status')).toContainText('Recipe was made.')

  await menu.getByRole('link', { name: 'Recipes', exact: true }).click()
  await menu.getByRole('link', { name: 'Add New' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Seeded rye')
  await expect(page.getByLabel('Slug')).toHaveValue('seeded-rye')
  await page.getByRole('button', { name: 'Create page' }).click()
  await expect(page.getByText('Page created.')).toBeVisible()

  const id = new URL(page.url()).pathname.split('/').pop()!
  const made = await api.getPage(id)
  expect(made.body).toMatchObject({
    title: 'Seeded rye',
    path: '/recipes/seeded-rye',
    type: { slug: 'recipe', name: 'Recipe' },
  })

  // Made again: the same name is refused by the real API, and said so.
  await menu.getByRole('link', { name: 'Content types' }).click()
  await page.getByLabel('Name').fill('recipe')
  await page.getByRole('button', { name: 'Make content type' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'This site already has a content type called Recipe.',
  )
})
