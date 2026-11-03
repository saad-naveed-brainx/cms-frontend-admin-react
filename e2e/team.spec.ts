import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  cafe,
  id,
  kettle,
  membership,
  ownerMemberships,
  roleOf,
  shop,
  theTeam,
  website,
  wholesale,
} from './support/company.ts'
import {
  SESSION_KEY,
  SITE_KEY,
  fakeSites,
  fakeTeam,
  fulfill,
  readStorage,
  signedInWith,
} from './support/mock-api.ts'
import type { FakeTeam, MockOrganization } from './support/mock-api.ts'

/**
 * The company team in the admin (organizations T7): the Team screen, Add person with one link for
 * several websites, what goes wrong, and who may see it. The API's answers are stood in for; the
 * whole journey on the real API is e2e/flow/organizations.spec.ts (T8).
 */

async function openAsOwner(page: Page, team: FakeTeam = theTeam()) {
  const session = await signedInWith(page, {
    memberships: ownerMemberships,
    organizations: [kettle],
  })
  const api = await fakeTeam(page, team)
  await fakeSites(page, session, [{ id: kettle.id, name: kettle.name }])
  return api
}

const inMenu = (page: Page) => page.getByRole('navigation', { name: 'Main' })
const emailBox = (page: Page) => page.getByLabel('Email', { exact: true })
const make = (page: Page) => page.getByRole('button', { name: 'Make invite link' })
const websiteBox = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true })
const roleBox = (page: Page, name: string) => page.getByLabel(`Role for ${name}`, { exact: true })

test.describe('the Team screen', () => {
  test('[UC-OR-19] lists each person once with their websites and roles, and the waiting invitations', async ({
    page,
  }) => {
    await openAsOwner(page)
    await page.goto('/')
    await inMenu(page).getByRole('link', { name: 'Team' }).click()
    await expect(page).toHaveURL(/\/team$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible()
    await expect(page.getByText('Kettle & Crumb Ltd: 3 people on 3 websites.')).toBeVisible()

    // Everyone at once, in the order the API gives (by name), each once.
    const people = page.getByRole('table', { name: 'People' })
    await expect(people.getByRole('row')).toHaveCount(4) // the header and three people
    const ada = people.getByRole('row', { name: /Ada Kettle/ })
    await expect(ada).toContainText('Owner')
    await expect(ada).toContainText('ada@kettle.test')
    for (const name of ['Café', 'Shop', 'Wholesale']) {
      await expect(ada.getByRole('link', { name })).toBeVisible()
    }
    const tom = people.getByRole('row', { name: /Tom Ashworth/ })
    await expect(tom.getByRole('listitem')).toHaveText(['Café Viewer', 'Shop Viewer'])
    await expect(
      people.getByRole('row', { name: /Maya Thornton/ }).getByRole('listitem'),
    ).toHaveText(['Café Editor'])
    await expect(people.getByRole('row').nth(1)).toContainText('Ada Kettle')
    await expect(people.getByRole('row').nth(3)).toContainText('Tom Ashworth')

    // Waiting invitations: the website, the role and until when; an expired one says so.
    const waiting = page.getByRole('table', { name: 'Waiting invitations' })
    const nina = waiting.getByRole('row', { name: /nina@kettle.test/ })
    await expect(nina).toContainText('Shop')
    await expect(nina).toContainText('Author')
    await expect(nina).toContainText('Link works until')
    await expect(waiting.getByRole('row', { name: /old@kettle.test/ })).toContainText('Expired')

    // A website's name leads to that website's Users screen.
    await tom.getByRole('link', { name: 'Shop' }).click()
    await expect(page).toHaveURL(/\/users$/)
    expect(await readStorage(page, SITE_KEY)).toBe(shop.id)
  })

  test('[UC-OR-22] a team that cannot load, is not theirs or is gone is said in words', async ({
    page,
  }) => {
    const api = await openAsOwner(page)
    const failWith = (status: number | 'offline') => {
      api.override = (route, request) => {
        if (request.method() !== 'GET') return false
        if (status === 'offline') void route.abort('connectionrefused')
        else void fulfill(route, status, { statusCode: status, message: 'Internal server error' })
        return true
      }
    }

    // A 500: said, with Try again, which loads it once the server is back.
    failWith(500)
    await page.goto('/team')
    await expect(page.getByText('Couldn’t load the team.')).toBeVisible()
    await expect(page.getByRole('main')).not.toContainText(/500|ApiError|Internal server error/)
    api.override = null
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('table', { name: 'People' })).toBeVisible()

    // The server down: the same words.
    failWith('offline')
    await page.reload()
    await expect(page.getByText('Couldn’t load the team.')).toBeVisible()
    await expect(page.getByRole('main')).not.toContainText(/Failed to fetch|NetworkError|ECONN/i)

    // Not theirs (403) and gone (404).
    failWith(403)
    await page.reload()
    await expect(
      page.getByText('Only the owner of this organization can see its team.'),
    ).toBeVisible()
    failWith(404)
    await page.reload()
    await expect(page.getByText('This organization isn’t available.')).toBeVisible()
  })
})

test.describe('Add person', () => {
  test('[UC-OR-20] gives one link for several websites, one invitation each, and a second ask gives a new link', async ({
    page,
  }) => {
    const api = await openAsOwner(page)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/team/new')

    await emailBox(page).fill('paul@kettle.test')
    await websiteBox(page, 'Café').check()
    await websiteBox(page, 'Wholesale').check()
    await roleBox(page, 'Café').selectOption({ label: 'Editor' })
    await roleBox(page, 'Wholesale').selectOption({ label: 'Viewer' })
    await make(page).click()

    // One request per ticked website, each with that website's id and role; none for Shop.
    await expect(
      page.getByRole('heading', { level: 2, name: 'Invite link for paul@kettle.test' }),
    ).toBeVisible()
    expect(api.posted).toEqual([
      { siteId: cafe.id, email: 'paul@kettle.test', roleId: roleOf(cafe, 'Editor').id },
      { siteId: wholesale.id, email: 'paul@kettle.test', roleId: roleOf(wholesale, 'Viewer').id },
    ])
    expect(api.calls.filter((call) => call.startsWith('POST'))).toEqual([
      'POST /invitations',
      'POST /invitations',
    ])

    // One link with both secrets, in view, with Copy ready; "Copied" after pressing it.
    const link = `${new URL(page.url()).origin}/invite#secret-1.secret-2`
    await expect(page.locator('.invite-link-row code')).toHaveText(link)
    await expect(page.getByText('They join Café as Editor and Wholesale as Viewer.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy' })).toBeFocused()
    await page.getByRole('button', { name: 'Copy' }).click()
    await expect(page.getByText('Copied', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link)
    await expect(page.getByText('The earlier link')).toHaveCount(0)

    // The Team list now shows the waiting invitation on the two websites.
    await page.goto('/team')
    const waiting = page.getByRole('table', { name: 'Waiting invitations' })
    await expect(waiting.getByRole('row', { name: /paul@kettle.test/ })).toHaveCount(2)
    await expect(waiting.getByRole('row', { name: /paul@kettle.test.*Café.*Editor/ })).toBeVisible()
    await expect(
      waiting.getByRole('row', { name: /paul@kettle.test.*Wholesale.*Viewer/ }),
    ).toBeVisible()

    // Asking again for the same email: a different link, and the earlier one stops working.
    await page.goto('/team/new')
    await emailBox(page).fill('paul@kettle.test')
    await websiteBox(page, 'Café').check()
    await make(page).click()
    await expect(page.locator('.invite-link-row code')).toHaveText(
      `${new URL(page.url()).origin}/invite#secret-3`,
    )
    await expect(page.getByText('The earlier link for Café stops working.')).toBeVisible()
  })

  test('[UC-OR-21] checks first, starts at the least access, sends the email tidied, and will not add what is already there', async ({
    page,
  }) => {
    const api = await openAsOwner(page)
    await page.goto('/team/new')
    const only = page.getByRole('main')

    // Every role box starts at the least access.
    for (const name of ['Café', 'Shop', 'Wholesale']) {
      await expect(roleBox(page, name).locator('option:checked')).toHaveText('Viewer')
    }

    // Nothing ticked and no email: both said, nothing sent, the email box first.
    await make(page).click()
    await expect(emailBox(page)).toHaveAccessibleDescription(/Enter a valid email address\./)
    await expect(emailBox(page)).toBeFocused()
    await emailBox(page).fill('paul@kettle')
    await make(page).click()
    await expect(only.getByText('Enter a valid email address.')).toBeVisible()
    await emailBox(page).fill('paul@kettle.test')
    await make(page).click()
    await expect(only.getByText('Choose at least one website.')).toBeVisible()
    await expect(websiteBox(page, 'Café')).toBeFocused()
    expect(api.posted).toEqual([])

    // A website where the email already has access cannot be ticked.
    await emailBox(page).fill('  TOM@Kettle.Test ')
    await expect(websiteBox(page, 'Café')).toBeDisabled()
    await expect(websiteBox(page, 'Shop')).toBeDisabled()
    await expect(websiteBox(page, 'Wholesale')).toBeEnabled()
    await expect(only.getByText('Already has access')).toHaveCount(2)
    await websiteBox(page, 'Wholesale').check()

    // Sent trimmed and in lower case.
    await make(page).click()
    await expect(page.locator('.invite-link-row code')).toBeVisible()
    expect(api.posted).toEqual([
      { siteId: wholesale.id, email: 'tom@kettle.test', roleId: roleOf(wholesale, 'Viewer').id },
    ])
  })

  test('[UC-OR-21] with nothing ticked the focus goes to the first website that can be ticked, never a disabled one', async ({
    page,
  }) => {
    const api = await openAsOwner(page)
    await page.goto('/team/new')

    // Maya is already an Editor on Café, so Café cannot be ticked for her; Shop is the first that can.
    await emailBox(page).fill('maya@kettle.test')
    await expect(websiteBox(page, 'Café')).toBeDisabled()
    await make(page).click()
    await expect(page.getByRole('main').getByText('Choose at least one website.')).toBeVisible()
    await expect(websiteBox(page, 'Shop')).toBeFocused()
    expect(api.posted).toEqual([])
  })

  test('[UC-OR-21] lists only this organization’s websites', async ({ page }) => {
    const maple: MockOrganization = { id: id(0xf2), name: 'Maple Group', ownsOrganization: false }
    const books = website(4, 'Maple Books')
    const session = await signedInWith(page, {
      memberships: [...ownerMemberships, membership(books, 'Viewer', false, maple)],
      organizations: [kettle, maple],
      storage: { 'cms-admin.org': kettle.id },
    })
    await fakeTeam(page, theTeam())
    await fakeSites(page, session, [{ id: kettle.id, name: kettle.name }])
    await page.goto('/team/new')
    await expect(page.getByRole('checkbox')).toHaveCount(3)
    await expect(page.getByRole('checkbox', { name: 'Maple Books' })).toHaveCount(0)
  })

  test('[UC-OR-23] one website failing is named and does not hide the ones that worked, and trying again makes only that one', async ({
    page,
  }) => {
    const api = await openAsOwner(page)
    await page.goto('/team/new')
    const failures: [number, string][] = [
      [409, 'That person already has access to Shop.'],
      [403, "You don't have permission to do that."],
      [500, 'Something went wrong. Try again.'],
    ]

    const asked = () => api.calls.filter((call) => call.startsWith('POST')).length
    for (const [status, message] of failures) {
      api.posted.length = 0
      api.calls.length = 0
      api.override = (route, request) => {
        if (request.method() !== 'POST' || request.headers()['x-site-id'] !== shop.id) return false
        void fulfill(
          route,
          status,
          status === 409 ? { message } : { statusCode: status, message: 'nope' },
        )
        return true
      }
      await emailBox(page).fill('paul@kettle.test')
      for (const name of ['Café', 'Shop', 'Wholesale']) await websiteBox(page, name).check()
      await make(page).click()

      // The link covers the two that were made; the failed one is named, with why.
      await expect(
        page.getByText('They join Café as Viewer and Wholesale as Viewer.'),
      ).toBeVisible()
      await expect(page.getByText('The link above does not cover Shop.')).toBeVisible()
      const problem = page.locator('.problem')
      await expect(problem).toContainText(`Shop: ${message}`)
      // All three were asked, in order; the refused one made nothing.
      expect(asked()).toBe(3)
      expect(api.posted.map((one) => one.siteId)).toEqual([cafe.id, wholesale.id])

      // Trying again for Shop alone makes its invitation, with a link of its own.
      api.override = null
      await problem.getByRole('button', { name: 'Try again for Shop' }).click()
      await expect(page.getByText('They join Shop as Viewer.')).toBeVisible()
      await expect(page.getByText('The link above does not cover Shop.')).toHaveCount(0)
      expect(asked()).toBe(4)
      expect(api.posted.map((one) => one.siteId)).toEqual([cafe.id, wholesale.id, shop.id])
      await expect(page.locator('.invite-link-row code')).toHaveCount(2)

      await page.getByRole('button', { name: 'Add another person' }).click()
      api.team.invitations = api.team.invitations.filter((one) => one.email !== 'paul@kettle.test')
    }
  })

  test('[UC-OR-23] a 401 on the way ends the session and shows the sign-in screen', async ({
    page,
  }) => {
    const api = await openAsOwner(page)
    await page.goto('/team/new')
    api.override = (route, request) => {
      if (request.method() !== 'POST' || request.headers()['x-site-id'] !== shop.id) return false
      void fulfill(route, 401, { statusCode: 401, message: 'Unauthorized' })
      return true
    }
    await emailBox(page).fill('paul@kettle.test')
    for (const name of ['Café', 'Shop', 'Wholesale']) await websiteBox(page, name).check()
    await make(page).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
    expect(await readStorage(page, SESSION_KEY)).toBeNull()
    // It stopped at the refusal: Café was made, Shop was refused, Wholesale was not asked.
    expect(api.calls.filter((call) => call.startsWith('POST'))).toHaveLength(2)
    expect(api.posted.map((one) => one.siteId)).toEqual([cafe.id])
  })
})

test.describe('a long list of websites', () => {
  test('[UC-OR-34] the button and the link stay in view, every control has a label, and it all works from the keyboard', async ({
    page,
  }) => {
    const many = Array.from({ length: 12 }, (_, n) => website(20 + n, `Website number ${n + 1}`))
    const spare: MockOrganization = { id: id(0xf4), name: 'Spare Ltd', ownsOrganization: true }
    const session = await signedInWith(page, {
      memberships: many.map((site) => membership(site, 'Administrator', true)),
      organizations: [kettle, spare],
    })
    const api = await fakeTeam(page, {
      organization: { id: kettle.id, name: kettle.name },
      websites: many,
      people: [],
      invitations: [],
    })
    await fakeSites(page, session, [])
    await page.setViewportSize({ width: 1280, height: 700 })
    await page.goto('/team/new')

    // The switchers and every box are named.
    const bar = page.getByRole('banner')
    await expect(bar.getByLabel('Organization', { exact: true })).toBeVisible()
    await expect(bar.getByLabel('Site', { exact: true })).toBeVisible()
    await expect(page.getByRole('checkbox')).toHaveCount(12)
    for (const site of many) {
      await expect(websiteBox(page, site.name)).toBeVisible()
      await expect(roleBox(page, site.name)).toBeVisible()
    }

    // Ticking the last website: the button is in view (it is a bar along the bottom).
    await emailBox(page).fill('long@kettle.test')
    await websiteBox(page, 'Website number 12').check()
    await expect(make(page)).toBeInViewport()

    // From the keyboard: Tab to the first box, Space ticks it, Tab to the button, Enter sends.
    await websiteBox(page, 'Website number 12').uncheck()
    await emailBox(page).focus()
    await page.keyboard.press('Tab')
    await expect(websiteBox(page, 'Website number 1')).toBeFocused()
    await page.keyboard.press('Space')
    await expect(websiteBox(page, 'Website number 1')).toBeChecked()
    await roleBox(page, 'Website number 12').focus()
    await page.keyboard.press('Tab')
    await expect(make(page)).toBeFocused()
    await page.keyboard.press('Enter')

    // The link and Copy are in view, wherever on the long list the button was; Copy has the focus.
    await expect(page.locator('.invite-link-row code')).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Copy' })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Copy' })).toBeFocused()
    expect(api.posted).toEqual([
      {
        siteId: many[0].id,
        email: 'long@kettle.test',
        roleId: roleOf(many[0], 'Viewer').id,
      },
    ])
  })
})

test.describe('who sees the team', () => {
  test('[UC-OR-24] only the owner has Team in the menu; anyone else on its address is told so and nothing is loaded', async ({
    page,
  }) => {
    // An Administrator, an Editor and a Viewer who do not own the organization.
    for (const role of ['Administrator', 'Editor', 'Viewer']) {
      const notOwner: MockOrganization = { ...kettle, ownsOrganization: false }
      const session = await signedInWith(page, {
        memberships: [membership(cafe, role, false, notOwner)],
        organizations: [notOwner],
      })
      const api = await fakeTeam(page, theTeam())
      await fakeSites(page, session, [])
      await page.goto('/')
      await expect(inMenu(page).getByRole('link', { name: 'Team' })).toHaveCount(0)

      await page.goto('/team')
      await expect(page.getByText('Team is for the owner of the organization.')).toBeVisible()
      await page.goto('/team/new')
      await expect(page.getByText('Add person is for the owner of the organization.')).toBeVisible()
      expect(api.calls).toEqual([])
      await page.unrouteAll({ behavior: 'ignoreErrors' })
    }
  })

  test('[UC-OR-24] an owner of several organizations sees the team of the chosen one', async ({
    page,
  }) => {
    const harbour: MockOrganization = { id: id(0xf3), name: 'Harbour Co', ownsOrganization: true }
    const harbourSite = website(5, 'Harbour Cafe')
    const session = await signedInWith(page, {
      memberships: [...ownerMemberships, membership(harbourSite, 'Administrator', true, harbour)],
      organizations: [harbour, kettle],
    })
    const api = await fakeTeam(page, theTeam())
    await fakeSites(page, session, [])
    await page.goto('/')

    // Harbour Co comes first by name, and is the one asked about.
    await inMenu(page).getByRole('link', { name: 'Team' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible()
    await expect.poll(() => api.calls).toContain('GET /organizations/' + harbour.id + '/team')

    await page
      .getByRole('banner')
      .getByLabel('Organization', { exact: true })
      .selectOption(kettle.id)
    await expect(page.getByRole('table', { name: 'People' })).toBeVisible()
    await expect.poll(() => api.calls).toContain('GET /organizations/' + kettle.id + '/team')
  })
})
