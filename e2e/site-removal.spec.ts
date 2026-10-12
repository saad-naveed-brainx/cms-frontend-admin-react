import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  fakeContent,
  fakeSites,
  fulfill,
  maple,
  orchard,
  orchardHoldings,
  signedInAs,
} from './support/mock-api.ts'

/**
 * Deleting a site on the Sites screen (D-039) with the API's answers given here, for the states the
 * real API cannot be made to produce on demand (a 403 for an owner, a failure, a site already gone).
 * The real flow is in e2e/flow/site-removal.spec.ts.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']

/** Signed in on Orchard Bakery, whose organisation the person owns, and on Maple Books, whose they do not. */
async function onTheSitesScreen(page: Page) {
  const session = await signedInAs(page, EVERYTHING)
  session.memberships = [
    { ...orchard, ownsOrganization: true },
    { ...maple, ownsOrganization: false },
  ]
  const api = await fakeSites(page, session, [orchardHoldings])
  await fakeContent(page, [])
  await page.goto('/sites')
  await expect(page.getByRole('heading', { level: 1, name: 'Sites' })).toBeVisible()
  return api
}

const panel = (page: Page) => page.getByRole('region', { name: 'Delete Orchard Bakery?' })
const confirmBox = (page: Page) => page.getByLabel('Type Orchard Bakery to confirm')
const deleteButton = (page: Page) => page.getByRole('button', { name: 'Delete this site' })

test('[UC-SD-05] Delete is offered only on a site whose organisation you own; it asks for the exact name, and deleting the current site moves you to another', async ({
  page,
}) => {
  const api = await onTheSitesScreen(page)
  const orchardRow = page.getByRole('row', { name: /Orchard Bakery/ })
  const mapleRow = page.getByRole('row', { name: /Maple Books/ })
  await expect(orchardRow).toContainText('Current site')
  await expect(mapleRow.getByRole('button', { name: /^Delete/ })).toHaveCount(0)

  await orchardRow.getByRole('button', { name: 'Delete Orchard Bakery' }).click()
  await expect(panel(page)).toContainText('all its pages, its web address (orchard.test)')
  await expect(panel(page)).toContainText('It cannot be undone.')
  await expect(confirmBox(page)).toBeFocused()
  await expect(deleteButton(page)).toBeDisabled()

  // Only the name exactly as it is: not in other capitals, not part of it.
  for (const wrong of ['orchard bakery', 'Orchard', 'Orchard Bakery!']) {
    await confirmBox(page).fill(wrong)
    await expect(deleteButton(page)).toBeDisabled()
    await confirmBox(page).press('Enter')
  }
  expect(api.deleted).toEqual([])

  // Escape and Cancel both close it, sending nothing.
  await confirmBox(page).press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await orchardRow.getByRole('button', { name: 'Delete Orchard Bakery' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(panel(page)).toHaveCount(0)
  expect(api.deleted).toEqual([])

  await orchardRow.getByRole('button', { name: 'Delete Orchard Bakery' }).click()
  await confirmBox(page).fill(' Orchard Bakery ')
  await deleteButton(page).click()

  await expect(page.getByRole('status')).toHaveText('Orchard Bakery was deleted.')
  expect(api.deleted).toEqual([orchard.site.id])
  await expect(panel(page)).toHaveCount(0)
  await expect(page.getByRole('row', { name: /Orchard Bakery/ })).toHaveCount(0)
  // The other site is now the one being worked on.
  await expect(mapleRow).toContainText('Current site')
  await expect(page.getByRole('banner')).toContainText('Maple Books')
})

test('[UC-SD-06] a refusal, a failure and a site already gone are explained, and the name typed stays', async ({
  page,
}) => {
  const api = await onTheSitesScreen(page)
  let answer: { status: number; body: object } = { status: 403, body: { message: 'Forbidden' } }
  api.override = (route, request) => {
    if (request.method() !== 'DELETE') return false
    void fulfill(route, answer.status, answer.body)
    return true
  }

  await page.getByRole('button', { name: 'Delete Orchard Bakery' }).click()
  await confirmBox(page).fill('Orchard Bakery')
  await deleteButton(page).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Only the owner of the organisation can delete this site.',
  )
  await expect(confirmBox(page)).toHaveValue('Orchard Bakery')
  await expect(deleteButton(page)).toBeEnabled()

  answer = { status: 500, body: { message: 'Internal server error' } }
  await deleteButton(page).click()
  await expect(page.getByRole('alert')).toHaveText('Couldn’t delete the site. Try again.')

  answer = { status: 404, body: { message: 'Site not found' } }
  await deleteButton(page).click()
  await expect(page.getByRole('alert')).toHaveText('This site no longer exists.')
  expect(api.deleted).toEqual([])
  await expect(page.getByRole('row', { name: /Orchard Bakery/ })).toBeVisible()
})
