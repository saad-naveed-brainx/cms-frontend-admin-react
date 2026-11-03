import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  ORGANIZATION_KEY,
  SITE_KEY,
  fakeContent,
  fakeSites,
  fulfill,
  inDays,
  orchard,
  readStorage,
  signedInWith,
  SESSION_KEY,
} from './support/mock-api.ts'
import type { MockMembership, MockOrganization } from './support/mock-api.ts'

/**
 * Organizations in the admin (organizations T6): the Organization switcher above the Site switcher,
 * New organization, the Sites screen grouped by organization, and an API that has not been updated
 * yet. The API's answers are stood in for, so every state can be made on demand; the whole journey on
 * the real API is e2e/flow/organizations.spec.ts (T8).
 */

const EVERYTHING = [
  'content.create',
  'content.edit_any',
  'content.edit_own',
  'content.publish',
  'members.manage',
]

const id = (n: number) => `0198f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`

const harbourCo: MockOrganization = { id: id(0xe1), name: 'Harbour Co', ownsOrganization: true }
const mapleGroup: MockOrganization = { id: id(0xe2), name: 'Maple Group', ownsOrganization: false }
const emptyLtd: MockOrganization = { id: id(0xe3), name: 'Empty Ltd', ownsOrganization: true }

/** A membership on site number `n`, in an organization, with the role given. */
function website(
  n: number,
  name: string,
  organization: MockOrganization,
  role: string,
): MockMembership {
  return {
    ...orchard,
    site: {
      ...orchard.site,
      id: id(10 + n),
      name,
      primaryHost: `site${n}.test`,
      organizationId: organization.id,
    },
    role: { id: id(60 + n), name: role },
    permissions: EVERYTHING,
    ownsOrganization: organization.ownsOrganization,
  }
}

const cafe = website(1, 'Harbour Cafe', harbourCo, 'Administrator')
const shop = website(2, 'Harbour Shop', harbourCo, 'Editor')
const books = website(3, 'Maple Books', mapleGroup, 'Viewer')

const inBar = (page: Page) => page.getByRole('banner')
const organizationSwitcher = (page: Page) => inBar(page).getByLabel('Organization', { exact: true })
const siteSwitcher = (page: Page) => inBar(page).getByLabel('Site', { exact: true })
const welcome = (page: Page, name: string) =>
  page.getByRole('heading', { level: 2, name, exact: true })

test.describe('the switchers', () => {
  test('[UC-OR-13] with several organizations a switcher picks one, then a website of it, and the choice is remembered', async ({
    page,
  }) => {
    await fakeContent(page, [])
    await signedInWith(page, {
      memberships: [cafe, shop, books],
      organizations: [harbourCo, mapleGroup],
    })

    // Nothing remembered: the first organization by name, with its websites. The Organization
    // switcher comes before the Site switcher.
    await expect(organizationSwitcher(page)).toHaveValue(harbourCo.id)
    await expect(organizationSwitcher(page).locator('option')).toHaveText([
      'Harbour Co',
      'Maple Group',
    ])
    await expect(siteSwitcher(page).locator('option')).toHaveText([
      'Harbour Cafe · Administrator',
      'Harbour Shop · Editor',
    ])
    await expect(inBar(page).getByRole('combobox').nth(0)).toHaveAccessibleName('Organization')
    await expect(inBar(page).getByRole('combobox').nth(1)).toHaveAccessibleName('Site')
    await expect(welcome(page, 'Harbour Cafe')).toBeVisible()

    // Another website of the same organization.
    await siteSwitcher(page).selectOption({ label: 'Harbour Shop · Editor' })
    await expect(welcome(page, 'Harbour Shop')).toBeVisible()

    // Another organization: its websites only, and one of them is opened.
    await organizationSwitcher(page).selectOption({ label: 'Maple Group' })
    await expect(organizationSwitcher(page)).toHaveValue(mapleGroup.id)
    await expect(siteSwitcher(page)).toHaveCount(0)
    await expect(inBar(page)).toContainText('Maple Books')
    await expect(welcome(page, 'Maple Books')).toBeVisible()
    expect(await readStorage(page, ORGANIZATION_KEY)).toBe(mapleGroup.id)
    expect(await readStorage(page, SITE_KEY)).toBe(books.site.id)

    // The choice survives a reload.
    await page.reload()
    await expect(organizationSwitcher(page)).toHaveValue(mapleGroup.id)
    await expect(welcome(page, 'Maple Books')).toBeVisible()

    // And back: the other organization lists its two websites again.
    await organizationSwitcher(page).selectOption({ label: 'Harbour Co' })
    await expect(siteSwitcher(page).locator('option')).toHaveCount(2)
    await expect(welcome(page, 'Harbour Cafe')).toBeVisible()
  })

  test('[UC-OR-13] with no organization remembered, the person lands in the organization of the website last used', async ({
    page,
  }) => {
    await fakeContent(page, [])
    await signedInWith(page, {
      memberships: [cafe, shop, books],
      organizations: [harbourCo, mapleGroup],
      storage: { [SITE_KEY]: books.site.id },
    })
    await expect(organizationSwitcher(page)).toHaveValue(mapleGroup.id)
    await expect(welcome(page, 'Maple Books')).toBeVisible()

    // An organization or website that is remembered but gone is not a reason to fail: the first organization.
    await page.evaluate(
      ([organizationKey, siteKey, gone]) => {
        localStorage.setItem(organizationKey, gone)
        localStorage.setItem(siteKey, gone)
      },
      [ORGANIZATION_KEY, SITE_KEY, id(0xdead)],
    )
    await page.reload()
    await expect(organizationSwitcher(page)).toHaveValue(harbourCo.id)
    await expect(welcome(page, 'Harbour Cafe')).toBeVisible()
  })

  test('[UC-OR-14] one organization with one website needs no switcher', async ({ page }) => {
    await fakeContent(page, [])
    await signedInWith(page, { memberships: [books], organizations: [mapleGroup] })

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await expect(welcome(page, 'Maple Books')).toBeVisible()
    await expect(inBar(page).getByRole('combobox')).toHaveCount(0)
    await expect(inBar(page)).toContainText('Maple Books')
  })

  test('[UC-OR-14] one organization with two websites needs a Site switcher only', async ({
    page,
  }) => {
    await fakeContent(page, [])
    await signedInWith(page, { memberships: [cafe, shop], organizations: [harbourCo] })

    await expect(siteSwitcher(page).locator('option')).toHaveText([
      'Harbour Cafe · Administrator',
      'Harbour Shop · Editor',
    ])
    await expect(organizationSwitcher(page)).toHaveCount(0)
  })

  test('[UC-OR-14] the owner of an organization with no website is told so, and Add your first website opens New site', async ({
    page,
  }) => {
    await fakeContent(page, [])
    const session = await signedInWith(page, { memberships: [], organizations: [emptyLtd] })
    const api = await fakeSites(page, session, [{ id: emptyLtd.id, name: emptyLtd.name }])
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1, name: 'No websites yet' })).toBeVisible()
    await expect(page.getByText('Empty Ltd has no websites yet.')).toBeVisible()
    await expect(inBar(page).getByRole('link', { name: 'New site' })).toBeVisible()
    await expect(inBar(page).getByRole('combobox')).toHaveCount(0)

    await page.getByRole('link', { name: 'Add your first website' }).click()
    await expect(page).toHaveURL(/\/sites\/new$/)
    await page.getByLabel('Name', { exact: true }).fill('First Website')
    await page.getByLabel('Web address', { exact: true }).fill('first.test')
    await page.getByRole('button', { name: 'Create site' }).click()

    // The one organization they own is used without being named, and the website is in it.
    expect(api.posted).toEqual([{ name: 'First Website', hostnames: ['first.test.localhost'] }])
    await expect(page).toHaveURL(/\/pages$/)
    await expect(inBar(page)).toContainText('First Website')
    await page.goto('/')
    await expect(welcome(page, 'First Website')).toBeVisible()
  })
})

test.describe('New organization', () => {
  const nameBox = (page: Page) => page.getByLabel('Name', { exact: true })
  const create = (page: Page) => page.getByRole('button', { name: 'Create organization' })

  test('[UC-OR-15] a new organization starts empty and leads to its first website', async ({
    page,
  }) => {
    await fakeContent(page, [])
    const session = await signedInWith(page, {
      memberships: [cafe, shop],
      organizations: [harbourCo],
    })
    const api = await fakeSites(page, session, [{ id: harbourCo.id, name: harbourCo.name }])
    await page.goto('/')
    await expect(organizationSwitcher(page)).toHaveCount(0)

    await inBar(page).getByRole('link', { name: 'New organization' }).click()
    await expect(page).toHaveURL(/\/organizations\/new$/)
    await expect(page.getByRole('heading', { level: 1, name: 'New organization' })).toBeVisible()
    await nameBox(page).fill('  Harbour Studio ')
    await create(page).click()

    // They are in it: the switcher (now they have two) shows it, and it has no website yet.
    expect(api.createdOrganizations).toEqual(['Harbour Studio'])
    await expect(page).toHaveURL(/\/$/)
    await expect(organizationSwitcher(page)).toHaveValue(/.+/)
    await expect(organizationSwitcher(page).locator('option:checked')).toHaveText('Harbour Studio')
    await expect(page.getByRole('heading', { level: 1, name: 'No websites yet' })).toBeVisible()
    await expect(page.getByText('Organization created.')).toBeVisible()
    await expect(siteSwitcher(page)).toHaveCount(0)

    // Add your first website: New site with that organization already chosen.
    await page.getByRole('link', { name: 'Add your first website' }).click()
    const chosen = page.getByRole('main').getByLabel('Organization', { exact: true })
    await expect(chosen.locator('option:checked')).toHaveText('Harbour Studio')
    await page.getByLabel('Name', { exact: true }).fill('Harbour Studio Site')
    await page.getByLabel('Web address', { exact: true }).fill('studio.test')
    await page.getByRole('button', { name: 'Create site' }).click()

    const harbourStudio = session.organizations?.find((one) => one.name === 'Harbour Studio')
    expect(harbourStudio).toBeDefined()
    expect(api.posted).toHaveLength(1)
    expect(api.posted[0].organizationId).toBe(harbourStudio?.id)
    await expect(page).toHaveURL(/\/pages$/)
    await expect(organizationSwitcher(page).locator('option:checked')).toHaveText('Harbour Studio')
    await expect(inBar(page)).toContainText('Harbour Studio Site')
    await page.goto('/')
    await expect(welcome(page, 'Harbour Studio Site')).toBeVisible()
  })

  test('[UC-OR-15] a person who owns nothing makes their first organization', async ({ page }) => {
    await fakeContent(page, [])
    const session = await signedInWith(page, { memberships: [], organizations: [] })
    const api = await fakeSites(page, session, [])
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'No sites yet' })).toBeVisible()

    await inBar(page).getByRole('link', { name: 'New organization' }).click()
    await nameBox(page).fill('Solo Ltd')
    await create(page).click()

    expect(api.createdOrganizations).toEqual(['Solo Ltd'])
    await expect(page.getByRole('heading', { level: 1, name: 'No websites yet' })).toBeVisible()
    await expect(page.getByText('Solo Ltd has no websites yet.')).toBeVisible()
    // One organization only: no switcher, the page says whose it is.
    await expect(inBar(page).getByRole('combobox')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Add your first website' })).toBeVisible()
  })

  test('[UC-OR-16] problems are said in words, and one click makes one organization', async ({
    page,
  }) => {
    await fakeContent(page, [])
    const session = await signedInWith(page, { memberships: [cafe], organizations: [harbourCo] })
    const api = await fakeSites(page, session, [{ id: harbourCo.id, name: harbourCo.name }])
    await page.goto('/organizations/new')

    // Empty, or only spaces: said here, and nothing is sent.
    await create(page).click()
    await expect(nameBox(page)).toHaveAccessibleDescription('Enter a name.')
    await expect(nameBox(page)).toBeFocused()
    await nameBox(page).fill('    ')
    await create(page).click()
    await expect(nameBox(page)).toHaveAccessibleDescription('Enter a name.')
    await nameBox(page).fill('n'.repeat(101))
    await create(page).click()
    await expect(nameBox(page)).toHaveAccessibleDescription('Use 100 characters or fewer.')
    expect(api.calls.filter((call) => call.startsWith('POST'))).toEqual([])

    // The server's own refusal goes next to the name box.
    await nameBox(page).fill('Harbour')
    api.override = (route, request) => {
      if (request.method() !== 'POST') return false
      void fulfill(route, 400, {
        message: 'Invalid request',
        errors: ['name: must not contain a NUL character'],
      })
      return true
    }
    await create(page).click()
    await expect(nameBox(page)).toHaveAccessibleDescription('must not contain a NUL character')

    // The server down, and a failure: said as a message, and what was typed stays.
    api.override = (route, request) => {
      if (request.method() !== 'POST') return false
      void route.abort('connectionrefused')
      return true
    }
    await create(page).click()
    await expect(page.getByRole('alert')).toHaveText(
      "Can't reach the server. Check your connection and try again.",
    )
    api.override = (route, request) => {
      if (request.method() !== 'POST') return false
      void fulfill(route, 500, { message: 'Internal server error' })
      return true
    }
    await create(page).click()
    await expect(page.getByRole('alert')).toHaveText('Something went wrong. Try again.')
    await expect(nameBox(page)).toHaveValue('Harbour')
    await expect(create(page)).toBeEnabled()
    expect(api.createdOrganizations).toEqual([])

    // A slow server and a double click: the button is off while it runs, and one organization is made.
    api.override = async (_route, request) => {
      if (request.method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 600))
      return false
    }
    await create(page).dblclick()
    // While it runs the button says so and is off.
    await expect(page.getByRole('button', { name: 'Creating…' })).toBeDisabled()
    await expect(page.getByRole('heading', { level: 1, name: 'No websites yet' })).toBeVisible()
    expect(api.createdOrganizations).toEqual(['Harbour'])
  })
})

test.describe('the Sites screen', () => {
  test('[UC-OR-17] websites are listed under their organization, and deleting the last one leaves the organization', async ({
    page,
  }) => {
    await fakeContent(page, [])
    const session = await signedInWith(page, {
      memberships: [cafe, shop, books],
      organizations: [harbourCo, mapleGroup],
    })
    await fakeSites(page, session, [{ id: harbourCo.id, name: harbourCo.name }])
    await page.goto('/sites')

    const harbour = page.getByRole('region', { name: 'Harbour Co' })
    const maple = page.getByRole('region', { name: 'Maple Group' })
    await expect(harbour.getByRole('row')).toHaveCount(3) // the header and two websites
    await expect(harbour.getByRole('row', { name: /Harbour Cafe/ })).toBeVisible()
    await expect(harbour.getByRole('row', { name: /Harbour Shop/ })).toBeVisible()
    await expect(maple.getByRole('row', { name: /Maple Books/ })).toBeVisible()
    // Switch and Delete as before: Delete only where the organization is theirs.
    await expect(harbour.getByRole('button', { name: 'Delete Harbour Cafe' })).toBeVisible()
    await expect(maple.getByRole('button', { name: /Delete/ })).toHaveCount(0)
    await expect(harbour.getByText('Current site')).toBeVisible()
    await expect(harbour.getByRole('button', { name: 'Switch to Harbour Shop' })).toBeVisible()
    await expect(maple.getByRole('button', { name: 'Switch to Maple Books' })).toBeVisible()

    // Switching to a website of another organization moves the organization too.
    await maple.getByRole('button', { name: 'Switch to Maple Books' }).click()
    await expect(organizationSwitcher(page)).toHaveValue(mapleGroup.id)
    await expect(welcome(page, 'Maple Books')).toBeVisible()
    await page.goto('/sites')

    // Delete the website being worked on, after typing its name: the other one takes its place.
    await harbour.getByRole('button', { name: 'Switch to Harbour Cafe' }).click()
    await page.goto('/sites')
    await harbour.getByRole('button', { name: 'Delete Harbour Cafe' }).click()
    await page.getByLabel('Type Harbour Cafe to confirm').fill('Harbour Cafe')
    await page.getByRole('button', { name: 'Delete this site' }).click()
    await expect(page.getByText('Harbour Cafe was deleted.')).toBeVisible()
    await expect(harbour.getByRole('row', { name: /Harbour Cafe/ })).toHaveCount(0)
    await expect(inBar(page)).toContainText('Harbour Shop')
    await expect(organizationSwitcher(page)).toHaveValue(harbourCo.id)

    // The last one: the organization stays, for its owner, with no website.
    await harbour.getByRole('button', { name: 'Delete Harbour Shop' }).click()
    await page.getByLabel('Type Harbour Shop to confirm').fill('Harbour Shop')
    await page.getByRole('button', { name: 'Delete this site' }).click()
    await expect(page.getByText('Harbour Shop was deleted.')).toBeVisible()
    await expect(harbour.getByText('No websites yet.')).toBeVisible()
    await expect(harbour.getByRole('link', { name: 'Add your first website' })).toBeVisible()
    await expect(organizationSwitcher(page)).toHaveValue(harbourCo.id)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'No websites yet' })).toBeVisible()
  })

  test('[UC-OR-17] a person removed from their only website sees no organization and the usual message', async ({
    page,
  }) => {
    await fakeContent(page, [])
    const session = await signedInWith(page, { memberships: [books], organizations: [mapleGroup] })
    await page.goto('/')
    await expect(welcome(page, 'Maple Books')).toBeVisible()

    // An administrator removes them: the API now answers with nothing.
    session.memberships = []
    session.organizations = []
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'No sites yet' })).toBeVisible()
    await expect(
      page.getByText('Your account is not a member of any site. Ask an administrator to add you.'),
    ).toBeVisible()
    await expect(inBar(page).getByRole('combobox')).toHaveCount(0)
    expect(await readStorage(page, ORGANIZATION_KEY)).toBeNull()
    expect(await readStorage(page, SITE_KEY)).toBeNull()
  })
})

test.describe('an API that has not been updated', () => {
  test('[UC-OR-18] an answer without organizations still signs in, with the flat Site switcher', async ({
    page,
  }) => {
    await fakeContent(page, [])
    // No `organizations`, and no `organizationId` on the sites.
    const old = (membership: MockMembership): MockMembership => {
      const { organizationId: _gone, ...site } = membership.site
      return { ...membership, site }
    }
    await signedInWith(page, { memberships: [old(cafe), old(books)] })

    await expect(siteSwitcher(page).locator('option')).toHaveText([
      'Harbour Cafe · Administrator',
      'Maple Books · Viewer',
    ])
    await expect(organizationSwitcher(page)).toHaveCount(0)
    await expect(inBar(page).getByRole('link', { name: 'New organization' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0)
    await expect(welcome(page, 'Harbour Cafe')).toBeVisible()
    expect(await readStorage(page, ORGANIZATION_KEY)).toBeNull()

    // The Sites screen is the flat list it was.
    await page.goto('/sites')
    await expect(page.getByRole('region')).toHaveCount(0)
    await expect(page.getByRole('row', { name: /Harbour Cafe/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Maple Books/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Add New Organization' })).toHaveCount(0)
  })

  test('[UC-OR-18] an answer that lists organizations in a form the admin cannot use is not half shown', async ({
    page,
  }) => {
    await page.route('**/auth/me', (route) =>
      fulfill(route, 200, {
        user: { id: id(1), email: 'x@y.test', name: 'X' },
        memberships: [cafe],
        organizations: 'Harbour Co',
      }),
    )
    await page.goto('/')
    await page.evaluate(
      ([key, expiresAt]) =>
        localStorage.setItem(key, JSON.stringify({ accessToken: 'saved-token', expiresAt })),
      [SESSION_KEY, inDays(1)],
    )
    await page.reload()
    await expect(
      page.getByRole('heading', { level: 1, name: "We couldn't check your session" }),
    ).toBeVisible()
  })
})
