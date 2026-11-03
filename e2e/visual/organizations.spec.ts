import { expect, test } from '@playwright/test'
import { cafe, kettle, ownerMemberships, theTeam, wholesale } from '../support/company.ts'
import type { FakeTeam } from '../support/mock-api.ts'
import { fakeContent, fakeSites, fakeTeam, signedInWith } from '../support/mock-api.ts'

/**
 * Screenshots of the organization screens against the approved baselines (organizations T7): the Team
 * screen, Add person with its link, New organization, the Sites screen grouped by organization, and the
 * top bar with both switchers, at phone, tablet and desktop width. The API's answers are replaced, with
 * the same data and the same dates every time, so the pictures do not change between runs; the whole
 * journey is tested in e2e/flow/. The invite link holds the admin's own address (its port), so it is masked.
 */

const FIXED = '2030-06-15T09:30:00.000Z'

/** The team of Kettle & Crumb Ltd, with a long email and a long name so wrapping is seen, and fixed dates. */
function teamToPhotograph(): FakeTeam {
  const team = theTeam()
  team.invitations = team.invitations.map((invitation) => ({
    ...invitation,
    expiresAt: invitation.expired ? '2020-01-01T00:00:00.000Z' : FIXED,
  }))
  team.people[1] = {
    ...team.people[1],
    name: 'Maya Thornton-Westerbergh de la Fontaine',
    email: 'maya.thornton-westerbergh.de.la.fontaine@a-company-with-a-long-name.example.test',
  }
  return team
}

for (const width of [375, 768, 1280]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('[UC-OR-33] the Team screen looks as approved', async ({ page }) => {
      await fakeContent(page, [])
      const session = await signedInWith(page, {
        memberships: ownerMemberships,
        organizations: [kettle],
      })
      await fakeTeam(page, teamToPhotograph())
      await fakeSites(page, session, [])
      await page.goto('/team')
      await expect(page.getByRole('table', { name: 'Waiting invitations' })).toBeVisible()
      await expect(page).toHaveScreenshot(`team-${width}.png`, { fullPage: true })
    })

    test('[UC-OR-33] Add person with its link looks as approved', async ({ page }) => {
      await fakeContent(page, [])
      const session = await signedInWith(page, {
        memberships: ownerMemberships,
        organizations: [kettle],
      })
      const api = await fakeTeam(page, teamToPhotograph())
      api.expiresAt = FIXED
      await fakeSites(page, session, [])
      await page.goto('/team/new')
      await page.getByLabel('Email', { exact: true }).fill('paul@kettle.test')
      await page.getByRole('checkbox', { name: cafe.name, exact: true }).check()
      await page.getByRole('checkbox', { name: wholesale.name, exact: true }).check()
      await page
        .getByLabel(`Role for ${cafe.name}`, { exact: true })
        .selectOption({ label: 'Editor' })
      await expect(page).toHaveScreenshot(`add-person-${width}.png`, { fullPage: true })

      await page.getByRole('button', { name: 'Make invite link' }).click()
      await expect(page.locator('.invite-link-row code')).toBeVisible()
      await expect(page).toHaveScreenshot(`add-person-link-${width}.png`, {
        fullPage: true,
        mask: [page.locator('.invite-link-row code')],
      })
    })

    test('[UC-OR-33] New organization looks as approved', async ({ page }) => {
      await fakeContent(page, [])
      const session = await signedInWith(page, {
        memberships: ownerMemberships,
        organizations: [kettle],
      })
      await fakeSites(page, session, [{ id: kettle.id, name: kettle.name }])
      await page.goto('/organizations/new')
      await page.getByRole('button', { name: 'Create organization' }).click()
      await expect(page.getByText('Enter a name.')).toBeVisible()
      await expect(page).toHaveScreenshot(`new-organization-${width}.png`, { fullPage: true })
    })

    test('[UC-OR-33] the Sites screen grouped by organization looks as approved', async ({
      page,
    }) => {
      await fakeContent(page, [])
      const other = {
        id: '0198f2a0-0000-7000-8000-0000000000f9',
        name: 'Harbour Studio',
        ownsOrganization: true,
      }
      const session = await signedInWith(page, {
        memberships: ownerMemberships,
        organizations: [other, kettle],
        storage: { 'cms-admin.org': kettle.id },
      })
      await fakeSites(page, session, [])
      await page.goto('/sites')
      await expect(page.getByRole('region', { name: 'Harbour Studio' })).toBeVisible()
      await expect(page).toHaveScreenshot(`sites-grouped-${width}.png`, { fullPage: true })
    })

    test('[UC-OR-33] the top bar with both switchers, and an organization with no website, look as approved', async ({
      page,
    }) => {
      await fakeContent(page, [])
      const other = {
        id: '0198f2a0-0000-7000-8000-0000000000f9',
        name: 'Harbour Studio',
        ownsOrganization: true,
      }
      await signedInWith(page, {
        memberships: ownerMemberships,
        organizations: [kettle, other],
        storage: { 'cms-admin.org': kettle.id },
      })
      await page.goto('/')
      await expect(page.getByRole('banner').getByLabel('Site', { exact: true })).toBeVisible()
      await expect(page).toHaveScreenshot(`top-bar-${width}.png`)

      await page
        .getByRole('banner')
        .getByLabel('Organization', { exact: true })
        .selectOption(other.id)
      await expect(page.getByRole('heading', { level: 1, name: 'No websites yet' })).toBeVisible()
      await expect(page).toHaveScreenshot(`no-websites-${width}.png`)
    })
  })
}
