import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeContent, fulfill, signedInAs } from './support/mock-api.ts'

/**
 * The Content types screen (feature content-types, D-043) with the API's answers given here, for
 * what the real API cannot be made to do on demand. The real flow is in
 * e2e/flow/content-types.spec.ts.
 */

const ADMIN = ['content.create', 'content.edit_any', 'content_types.manage']
const menu = (page: Page) => page.getByRole('navigation', { name: 'Main' })

test('[UC-CT-04] an administrator makes a type from a name and an address suggested from it; its menu entry appears at once; refusals are shown', async ({
  page,
}) => {
  const api = await fakeContent(page, [])
  await signedInAs(page, ADMIN)
  await page.goto('/')
  await menu(page).getByRole('link', { name: 'Content types' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Content types' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Built in' })).toHaveCount(2)
  await expect(page.getByRole('row', { name: /Posts/ })).toContainText('/blog/…')

  // Nothing typed: explained, nothing sent.
  await page.getByRole('button', { name: 'Make content type' }).click()
  await expect(page.getByLabel('Name')).toHaveAccessibleDescription(
    'One of them, as you would say it: Recipe, Event, Team member. Enter a name.',
  )
  await expect(page.getByLabel('Name')).toBeFocused()

  // The address follows the name until it is typed over, tidied as it is typed.
  await page.getByLabel('Name').fill('Team member')
  await expect(page.getByLabel('Address')).toHaveValue('team-members')
  await expect(
    page.getByText('Its items will be at /team-members/…, and /team-members lists them.'),
  ).toBeVisible()
  await page.getByLabel('Address').fill('Our Team!')
  await expect(page.getByLabel('Address')).toHaveValue('our-team')
  await page.getByLabel('Name').fill('Team Member')
  await expect(page.getByLabel('Address')).toHaveValue('our-team')

  await page.getByRole('button', { name: 'Make content type' }).click()
  await expect(page.getByRole('status')).toContainText(
    'Team Member was made. Its items will be at /our-team/…, and /our-team lists them once one is published.',
  )
  expect(api.types.map((type) => [type.name, type.urlPrefix])).toContainEqual([
    'Team Member',
    '/our-team',
  ])
  await expect(page.getByRole('row', { name: /Team Members/ })).toContainText('This site')
  // The menu has it now, without a reload, with All and Add New.
  await menu(page).getByRole('link', { name: 'Team Members', exact: true }).click()
  await expect(menu(page).getByRole('link', { name: 'All Team Members' })).toBeVisible()
  await expect(menu(page).getByRole('link', { name: 'Add New' })).toHaveAttribute(
    'href',
    '/pages/new?type=team-member',
  )

  // A name another type has.
  await menu(page).getByRole('link', { name: 'Content types' }).click()
  await page.getByLabel('Name').fill('Post')
  await page.getByRole('button', { name: 'Make content type' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'This site already has a content type called Post.',
  )

  // The API's refusal by field is shown under that field.
  api.override = (route, request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/content-types')) return false
    void fulfill(route, 400, {
      message: 'Invalid request',
      errors: ['urlPrefix: /api is kept for the website itself; pick another address'],
    })
    return true
  }
  await page.getByLabel('Name').fill('Api')
  await page.getByRole('button', { name: 'Make content type' }).click()
  await expect(page.getByLabel('Address')).toHaveAccessibleDescription(
    /\/api is kept for the website itself; pick another address$/,
  )
})

test('[UC-CT-04] without content_types.manage there is no menu entry, and the screen only lists the types', async ({
  page,
}) => {
  await fakeContent(page, [])
  await signedInAs(page, ['content.create'])
  await page.goto('/')
  await expect(menu(page).getByRole('link', { name: 'Pages', exact: true })).toBeVisible()
  await expect(menu(page).getByRole('link', { name: 'Content types' })).toHaveCount(0)
  await page.goto('/types')
  await expect(page.getByRole('row').filter({ hasText: 'Built in' })).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Make content type' })).toHaveCount(0)
  await expect(
    page.getByText('Only an administrator of this site can make content types.'),
  ).toBeVisible()
})
