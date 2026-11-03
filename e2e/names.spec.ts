import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { id, membership, roleOf, website } from './support/company.ts'
import {
  ORGANIZATION_KEY,
  fakeContent,
  fakeInvites,
  fakeSites,
  fakeTeam,
  fulfill,
  person,
  profileBody,
  signedInWith,
} from './support/mock-api.ts'
import type { FakeTeam, MockOrganization } from './support/mock-api.ts'

/**
 * Names with HTML in them (organizations T8, UC-OR-25): an organization, a website and a person each
 * named `<b>Bold</b>` show as those characters, never as bold or markup, on every screen of the
 * company feature: the top bar's switchers, Sites, Team, Add person and the invite page.
 */

const BOLD = '<b>Bold</b>'

/** The page shows the characters as text and has made no element of them. */
async function showsAsText(page: Page) {
  await expect(page.getByRole('main').getByText(BOLD).first()).toBeVisible()
  await expect(page.locator('b')).toHaveCount(0)
}

test('[UC-OR-25] names with HTML show as text everywhere they appear', async ({ page }) => {
  const bold: MockOrganization = { id: id(0xb0), name: BOLD, ownsOrganization: true }
  const other: MockOrganization = { id: id(0xb1), name: 'Other Co', ownsOrganization: true }
  const first = website(7, BOLD)
  const second = website(8, 'Second site')
  const away = website(9, 'Away')
  const session = await signedInWith(page, {
    memberships: [
      membership(first, 'Administrator', true, bold),
      membership(second, 'Administrator', true, bold),
      membership(away, 'Administrator', true, other),
    ],
    organizations: [bold, other],
    storage: { [ORGANIZATION_KEY]: bold.id },
  })
  // The signed-in person is named with HTML too.
  await page.route('**/auth/me', (route) =>
    fulfill(route, 200, {
      ...profileBody(session.memberships, session.organizations),
      user: { ...person, name: BOLD },
    }),
  )
  const team: FakeTeam = {
    organization: { id: bold.id, name: BOLD },
    websites: [first, second],
    people: [
      {
        userId: id(0xc1),
        name: BOLD,
        email: 'bold@kettle.test',
        isOwner: false,
        access: [{ siteId: first.id, role: roleOf(first, 'Editor') }],
      },
    ],
    invitations: [],
  }
  await fakeTeam(page, team)
  await fakeSites(page, session, [
    { id: bold.id, name: BOLD },
    { id: other.id, name: other.name },
  ])
  await fakeContent(page)

  // The top bar: the person, the Organization switcher and the Site switcher.
  await page.goto('/')
  const bar = page.getByRole('banner')
  await expect(bar.getByText(`Howdy, ${BOLD}`)).toBeVisible()
  const options = (label: string) =>
    bar.getByLabel(label, { exact: true }).locator('option').allTextContents()
  expect(await options('Organization')).toEqual([BOLD, 'Other Co'])
  expect(await options('Site')).toEqual([`${BOLD} · Administrator`, 'Second site · Administrator'])
  await expect(page.locator('b')).toHaveCount(0)

  // Sites: the organization's heading and the website's name.
  await page.goto('/sites')
  await expect(page.getByRole('heading', { level: 2, name: BOLD })).toBeVisible()
  await showsAsText(page)

  // Team: the person, and the website they are on.
  await page.goto('/team')
  await expect(page.getByRole('table', { name: 'People' }).getByText(BOLD).first()).toBeVisible()
  await showsAsText(page)

  // Add person: the website's box and its role box are named with it.
  await page.goto('/team/new')
  await expect(page.getByRole('checkbox', { name: BOLD, exact: true })).toBeVisible()
  await expect(page.getByLabel(`Role for ${BOLD}`, { exact: true })).toBeVisible()
  await showsAsText(page)

  // The invite page: the organization and the website.
  const invite = (
    token: string,
    siteId: string,
    siteName: string,
    roleName: 'Editor' | 'Viewer',
  ) => ({
    token,
    siteId,
    siteName,
    organization: { id: bold.id, name: BOLD },
    roleName,
    email: 'newcomer@kettle.test',
    hasAccount: false,
  })
  await fakeInvites(page, [
    invite('secret-bold-1', first.id, BOLD, 'Editor'),
    invite('secret-bold-2', second.id, 'Second site', 'Viewer'),
  ])
  await page.goto('/invite#secret-bold-1.secret-bold-2')
  await expect(
    page.getByRole('heading', { level: 1, name: `You're invited to ${BOLD}` }),
  ).toBeVisible()
  await expect(page.getByRole('listitem').first()).toHaveText(`${BOLD} as Editor`)
  await expect(page.locator('b')).toHaveCount(0)
})
