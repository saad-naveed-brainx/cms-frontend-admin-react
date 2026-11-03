import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { cafe, id, kettle, shop, wholesale } from './support/company.ts'
import {
  ORGANIZATION_KEY,
  SESSION_KEY,
  SITE_KEY,
  fakeContent,
  fakeInvites,
  fulfill,
  orchard,
  readStorage,
  signedInAs,
} from './support/mock-api.ts'
import type { FakeInvite } from './support/mock-api.ts'

/**
 * The page an invite link opens (users-roles T7), with the API's answers given by a stand-in that
 * follows the real routes' rules (`fakeInvites`). The whole journey on the real API is in
 * e2e/flow/invite.spec.ts.
 */

// The stand-in gives every joined site this id.
const JOINED_SITE = '0198f2a0-0000-7000-8000-0000000000c1'

const NEW: FakeInvite = {
  token: 'secret-for-nina',
  siteName: 'Kettle & Crumb',
  roleName: 'Contributor',
  email: 'nina@orchard.test',
  hasAccount: false,
}
const KNOWN: FakeInvite = {
  token: 'secret-for-olivia',
  siteName: 'Maple Books',
  roleName: 'Viewer',
  email: 'olivia@orchard.test',
  hasAccount: true,
  alsoMemberOf: [orchard],
}

const DEAD = 'This invite is no longer valid. Ask for a new one.'
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true })
const password = (page: Page) => page.getByLabel('Password', { exact: true })

test('[UC-UR-22] a new email makes an account and lands on the site it was invited to', async ({
  page,
}) => {
  const api = await fakeInvites(page, [NEW])
  await fakeContent(page)
  await page.goto('/invite#secret-for-nina')

  await expect(heading(page, "You're invited to Kettle & Crumb as Contributor")).toBeVisible()
  await expect(page.getByText('This invite is for nina@orchard.test.')).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveCount(0)

  // One password box with a Show button.
  await expect(password(page)).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show' }).click()
  await expect(password(page)).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide' }).click()
  await expect(password(page)).toHaveAttribute('type', 'password')

  // Nothing is sent until the form is whole.
  const join = page.getByRole('button', { name: 'Create account and join' })
  await join.click()
  await expect(page.locator('#name-error')).toHaveText('Enter your name.')
  await expect(page.locator('#password-error')).toHaveText('Choose a password.')
  await page.getByLabel('Name').fill('Nina Novak')
  await password(page).fill('too short')
  await join.click()
  await expect(page.locator('#password-error')).toHaveText('Use at least 12 characters.')
  expect(api.calls.filter((call) => call.path === '/invitations/accept')).toEqual([])

  await password(page).fill('a long enough password')
  await join.click()
  await expect(
    page.getByText(
      'Signed in as Nina Novak (nina@orchard.test). Your role on this site: Contributor.',
    ),
  ).toBeVisible()

  // The secret is gone from the address, and the person is signed in on the invited site.
  expect(new URL(page.url()).pathname).toBe('/')
  expect(page.url()).not.toContain('secret-for-nina')
  expect(await readStorage(page, SITE_KEY)).toBe(JOINED_SITE)
  expect(JSON.parse((await readStorage(page, SESSION_KEY)) ?? '{}')).toMatchObject({
    accessToken: 'invited-secret-for-nina',
  })
  expect(api.calls.find((call) => call.path === '/invitations/accept')?.body).toEqual({
    token: 'secret-for-nina',
    password: 'a long enough password',
    name: 'Nina Novak',
  })
})

test('[UC-UR-22] someone with an account types only their password and lands on the invited site', async ({
  page,
}) => {
  const api = await fakeInvites(page, [KNOWN])
  await fakeContent(page)
  await page.goto('/invite#secret-for-olivia')

  await expect(heading(page, "You're invited to Maple Books as Viewer")).toBeVisible()
  await expect(page.getByLabel('Name')).toHaveCount(0)
  await expect(page.getByText('At least 12 characters.')).toHaveCount(0)

  // A wrong password is said, and the invite stays.
  await password(page).fill('not her password')
  await page.getByRole('button', { name: 'Sign in and join' }).click()
  await expect(page.locator('#password-error')).toHaveText('Password is incorrect.')
  await expect(password(page)).toBeFocused()
  await expect(password(page)).toHaveValue('')
  expect(api.joined).toEqual([])
  expect(api.calls.at(-1)?.body).not.toHaveProperty('name')

  // She already belonged to Orchard Bakery: she lands on the site she was invited to.
  await password(page).fill('orchard-flow-password')
  await page.getByRole('button', { name: 'Sign in and join' }).click()
  await expect(page.getByText('Your role on this site: Viewer.')).toBeVisible()
  await expect(heading(page, 'Maple Books')).toBeVisible()
  expect(await readStorage(page, SITE_KEY)).toBe(JOINED_SITE)
})

test('[UC-UR-22] an account made after the page was opened turns it into a sign-in', async ({
  page,
}) => {
  const api = await fakeInvites(page, [NEW], { accountPassword: 'the password she chose' })
  await fakeContent(page)
  await page.goto('/invite#secret-for-nina')
  await expect(page.getByLabel('Name')).toBeVisible()

  // While the page is open, the email gets an account elsewhere.
  api.invites[0].hasAccount = true
  await page.getByLabel('Name').fill('Nina Novak')
  await password(page).fill('a long enough password')
  await page.getByRole('button', { name: 'Create account and join' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'This email already has an account. Sign in to join.',
  )
  await expect(page.getByLabel('Name')).toHaveCount(0)
  await expect(password(page)).toHaveValue('')

  await password(page).fill('the password she chose')
  await page.getByRole('button', { name: 'Sign in and join' }).click()
  await expect(page.getByText('Your role on this site: Contributor.')).toBeVisible()
})

test('[UC-UR-22] a dead link, a link with no secret and a server that is down are each explained', async ({
  page,
}) => {
  const api = await fakeInvites(page, [NEW])
  await fakeContent(page)

  // Used, cancelled, expired and unknown links are the same 404.
  await page.goto('/invite#not-a-real-secret')
  await expect(page.getByRole('alert')).toHaveText(DEAD)
  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()

  // No secret at all: the same words, and the API is not asked.
  const asked = api.calls.length
  await page.goto('/invite')
  await expect(page.getByRole('alert')).toHaveText(DEAD)
  expect(api.calls.length).toBe(asked)

  // The API is down: say so, and the same link works once it is back.
  let down = true
  await page.route(
    (url) => url.pathname === '/invitations/lookup',
    (route) => (down ? route.abort('connectionrefused') : route.fallback()),
  )
  await page.goto('/invite#secret-for-nina')
  await expect(page.getByRole('alert')).toHaveText("Can't check this invite right now. Try again.")
  down = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(heading(page, "You're invited to Kettle & Crumb as Contributor")).toBeVisible()
})

test('[UC-UR-22] while someone is signed in, the page says so first, and joining replaces their session', async ({
  page,
}) => {
  await signedInAs(page, ['content.create', 'members.manage'], { role: 'Administrator' })
  await fakeInvites(page, [NEW])
  await fakeContent(page)
  await page.goto('/invite#secret-for-nina')

  await expect(
    page.getByText(
      "You're signed in as Olivia Orchard. Joining signs you in as nina@orchard.test.",
    ),
  ).toBeVisible()

  await page.getByLabel('Name').fill('Nina Novak')
  await password(page).fill('a long enough password')
  await page.getByRole('button', { name: 'Create account and join' }).click()

  await expect(
    page.getByText(
      'Signed in as Nina Novak (nina@orchard.test). Your role on this site: Contributor.',
    ),
  ).toBeVisible()
  expect(JSON.parse((await readStorage(page, SESSION_KEY)) ?? '{}')).toMatchObject({
    accessToken: 'invited-secret-for-nina',
  })
})

test('[UC-UR-23] the invite page says when sign-in is paused, and works again afterwards', async ({
  page,
}) => {
  const api = await fakeInvites(page, [KNOWN])
  await fakeContent(page)
  api.paused = true
  await page.goto('/invite#secret-for-olivia')

  await password(page).fill('orchard-flow-password')
  await page.getByRole('button', { name: 'Sign in and join' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Too many sign-in attempts. Try again in 15 minutes.',
  )
  expect(await readStorage(page, SESSION_KEY)).toBeNull()
  expect(api.joined).toEqual([])

  api.paused = false
  await password(page).fill('orchard-flow-password')
  await page.getByRole('button', { name: 'Sign in and join' }).click()
  await expect(page.getByText('Your role on this site: Viewer.')).toBeVisible()
})

test('[UC-UR-22] an answer the new-account form should never get is said as "something went wrong", not as a wrong password', async ({
  page,
}) => {
  await fakeInvites(page, [NEW])
  await fakeContent(page)
  // Only an existing account's password is checked, so a 401 here is not about the password.
  await page.route(
    (url) => url.pathname === '/invitations/accept',
    (route) => fulfill(route, 401, { statusCode: 401, message: 'Invalid email or password' }),
  )
  await page.goto('/invite#secret-for-nina')

  await page.getByLabel('Name').fill('Nina Novak')
  await password(page).fill('a long enough password')
  await page.getByRole('button', { name: 'Create account and join' }).click()

  await expect(page.getByRole('alert')).toHaveText('Something went wrong. Try again.')
  await expect(page.locator('#password-error')).toHaveCount(0)
})

// ---- a link for several websites of one organization (organizations T8, D-055) ----

/** One secret per website: Nina's invitations to Kettle & Crumb Ltd's websites, each with its own role. */
const forNina = (
  site: { id: string; name: string },
  token: string,
  roleName: FakeInvite['roleName'],
): FakeInvite => ({
  token,
  siteId: site.id,
  siteName: site.name,
  organization: { id: kettle.id, name: kettle.name },
  roleName,
  email: 'nina@kettle.test',
  hasAccount: false,
})
const CAFE = forNina(cafe, 'secret-cafe', 'Editor')
const SHOP = forNina(shop, 'secret-shop', 'Viewer')
const WHOLESALE = forNina(wholesale, 'secret-wholesale', 'Author')

type Stand = Awaited<ReturnType<typeof fakeInvites>>
const accepts = (api: Stand) => api.calls.filter((call) => call.path === '/invitations/accept')
const lookups = (api: Stand) => api.calls.filter((call) => call.path === '/invitations/lookup')
const switcher = (page: Page) => page.getByRole('banner').getByLabel('Site', { exact: true })

test('[UC-OR-26] a link for several websites joins a new person to all of them: the name once, the password for each', async ({
  page,
}) => {
  const api = await fakeInvites(page, [CAFE, SHOP])
  await fakeContent(page)
  await page.goto('/invite#secret-cafe.secret-shop')

  // One heading for the organization, and each website with its role.
  await expect(heading(page, "You're invited to Kettle & Crumb Ltd")).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveText(['Café as Editor', 'Shop as Viewer'])
  await expect(page.getByText('This invite is for nina@kettle.test.')).toBeVisible()
  expect([...new Set(lookups(api).map((call) => call.body.token))].sort()).toEqual([
    'secret-cafe',
    'secret-shop',
  ])

  await page.getByLabel('Name').fill('Nina Novak')
  await password(page).fill('a long enough password')
  await page.getByRole('button', { name: 'Create account and join' }).click()

  // Signed in on the first website's Dashboard, chosen by its id, with both in the Site switcher.
  await expect(
    page.getByText('Signed in as Nina Novak (nina@kettle.test). Your role on this site: Editor.'),
  ).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Café', exact: true })).toBeVisible()
  await expect(switcher(page)).toHaveValue(cafe.id)
  await expect(switcher(page).locator('option')).toHaveText(['Café · Editor', 'Shop · Viewer'])
  expect(await readStorage(page, SITE_KEY)).toBe(cafe.id)
  expect(await readStorage(page, ORGANIZATION_KEY)).toBe(kettle.id)

  // The first accept sent the name and the password, the second the password only.
  expect(accepts(api).map((call) => call.body)).toEqual([
    { token: 'secret-cafe', password: 'a long enough password', name: 'Nina Novak' },
    { token: 'secret-shop', password: 'a long enough password' },
  ])
  // The secrets are gone from the address, and no notice is shown: nothing was missed.
  expect(new URL(page.url()).pathname).toBe('/')
  expect(page.url()).not.toContain('secret-')
  await expect(page.getByText(/You joined/)).toHaveCount(0)
})

test('[UC-OR-27] an existing account types only its password, and a wrong one is tried once, not once for each website', async ({
  page,
}) => {
  const known = (invite: FakeInvite): FakeInvite => ({
    ...invite,
    email: 'olivia@kettle.test',
    hasAccount: true,
  })
  const api = await fakeInvites(page, [known(CAFE), known(SHOP), known(WHOLESALE)], {
    accountPassword: 'her real password',
  })
  await fakeContent(page)
  await page.goto('/invite#secret-cafe.secret-shop.secret-wholesale')
  await expect(page.getByRole('listitem')).toHaveText([
    'Café as Editor',
    'Shop as Viewer',
    'Wholesale as Author',
  ])
  await expect(page.getByLabel('Name')).toHaveCount(0)
  const signInAndJoin = page.getByRole('button', { name: 'Sign in and join' })

  // A wrong password: one request, on the first secret; said; nothing joined.
  await password(page).fill('not her password')
  await signInAndJoin.click()
  await expect(page.locator('#password-error')).toHaveText('Password is incorrect.')
  expect(accepts(api).map((call) => call.body)).toEqual([
    { token: 'secret-cafe', password: 'not her password' },
  ])
  expect(api.joined).toEqual([])

  // Paused: the API's own words, after one more request and still nothing joined.
  api.paused = true
  await password(page).fill('her real password')
  await signInAndJoin.click()
  await expect(page.getByRole('alert')).toHaveText(
    'Too many sign-in attempts. Try again in 15 minutes.',
  )
  expect(accepts(api)).toHaveLength(2)
  expect(api.joined).toEqual([])

  // The right password joins all three, one after another, and lands on the first.
  api.paused = false
  await password(page).fill('her real password')
  await signInAndJoin.click()
  await expect(page.getByText('Your role on this site: Editor.')).toBeVisible()
  expect(
    accepts(api)
      .slice(2)
      .map((call) => call.body),
  ).toEqual([
    { token: 'secret-cafe', password: 'her real password' },
    { token: 'secret-shop', password: 'her real password' },
    { token: 'secret-wholesale', password: 'her real password' },
  ])
  expect(api.joined).toHaveLength(3)
  await expect(switcher(page).locator('option')).toHaveText([
    'Café · Editor',
    'Shop · Viewer',
    'Wholesale · Author',
  ])
})

test('[UC-OR-28] empty and repeated parts are ignored; secrets for different emails or organizations, and more than 20, are a dead link', async ({
  page,
}) => {
  const api = await fakeInvites(page, [
    CAFE,
    SHOP,
    { ...WHOLESALE, email: 'someone.else@kettle.test' },
    { ...SHOP, token: 'secret-other', organization: { id: id(0xd9), name: 'Other Co' } },
  ])
  await fakeContent(page)

  // An empty part is ignored.
  await page.goto('/invite#secret-cafe..secret-shop')
  await expect(page.getByRole('listitem')).toHaveText(['Café as Editor', 'Shop as Viewer'])

  // A repeated secret is one website, as a link of one secret always was.
  await page.goto('/invite#secret-cafe.secret-cafe')
  await expect(heading(page, "You're invited to Café as Editor")).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(0)

  // One secret, exactly as before.
  await page.goto('/invite#secret-cafe')
  await expect(heading(page, "You're invited to Café as Editor")).toBeVisible()

  // Made for different emails, or for different organizations: the usual dead link.
  await page.goto('/invite#secret-cafe.secret-wholesale')
  await expect(page.getByRole('alert')).toHaveText(DEAD)
  await page.goto('/invite#secret-cafe.secret-other')
  await expect(page.getByRole('alert')).toHaveText(DEAD)

  // More than 20 secrets: the same words, and the API is not asked about any of them.
  const asked = lookups(api).length
  const tooMany = Array.from({ length: 21 }, (_, n) => `secret-${n}`).join('.')
  await page.goto(`/invite#${tooMany}`)
  await expect(page.getByRole('alert')).toHaveText(DEAD)
  expect(lookups(api)).toHaveLength(asked)
})

test('[UC-OR-29] a dead part is left out and said, and the rest still joins; a link that is all dead is the usual dead link', async ({
  page,
}) => {
  // Three secrets, one of which the API does not know any more (used or cancelled).
  const api = await fakeInvites(page, [CAFE, WHOLESALE])
  await fakeContent(page)

  await page.goto('/invite#gone-one.gone-two')
  await expect(page.getByRole('alert')).toHaveText(DEAD)

  await page.goto('/invite#secret-cafe.secret-shop.secret-wholesale')
  await expect(page.getByRole('listitem')).toHaveText(['Café as Editor', 'Wholesale as Author'])
  await expect(page.getByText('One part of this invite is no longer valid.')).toBeVisible()

  await page.getByLabel('Name').fill('Nina Novak')
  await password(page).fill('a long enough password')
  await page.getByRole('button', { name: 'Create account and join' }).click()
  await expect(page.getByText('Your role on this site: Editor.')).toBeVisible()
  // Only the live ones were joined, and the person was not told of a failure: the page said it first.
  expect(accepts(api).map((call) => call.body.token)).toEqual(['secret-cafe', 'secret-wholesale'])
  await expect(switcher(page).locator('option')).toHaveText(['Café · Editor', 'Wholesale · Author'])
  await expect(page.getByText(/You joined/)).toHaveCount(0)
})

test('[UC-OR-30] when the second website fails after the first worked, they are signed in with the first and told; opening the link again offers only the second', async ({
  page,
}) => {
  const api = await fakeInvites(page, [CAFE, SHOP])
  await fakeContent(page)
  // The server fails on the second website, once.
  let failShop = true
  let shopTries = 0
  await page.route(
    (url) => url.pathname === '/invitations/accept',
    (route, request) => {
      if (!failShop || (request.postDataJSON() as { token?: string }).token !== 'secret-shop') {
        return route.fallback()
      }
      shopTries += 1
      return fulfill(route, 500, { statusCode: 500, message: 'Internal server error' })
    },
  )
  await page.goto('/invite#secret-cafe.secret-shop')
  await page.getByLabel('Name').fill('Nina Novak')
  await password(page).fill('a long enough password')
  await page.getByRole('button', { name: 'Create account and join' }).click()

  // Signed in with the first website, and told which one is missing and what to do.
  await expect(
    page.getByText('Signed in as Nina Novak (nina@kettle.test). Your role on this site: Editor.'),
  ).toBeVisible()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'You joined Café, but not Shop. Open the link again.' }),
  ).toBeVisible()
  expect(accepts(api).map((call) => call.body.token)).toEqual(['secret-cafe'])
  expect(shopTries).toBe(1)
  await expect(switcher(page)).toHaveCount(0) // one website: its name is shown instead

  // Opening the link again, in a new tab with nothing stored: only Shop is left, and the account
  // exists now, so it asks for the password only.
  failShop = false
  await page.evaluate(() => localStorage.clear())
  await page.goto('/invite#secret-cafe.secret-shop')
  await expect(page.getByRole('listitem')).toHaveText(['Shop as Viewer'])
  await expect(page.getByText('One part of this invite is no longer valid.')).toBeVisible()
  await expect(page.getByLabel('Name')).toHaveCount(0)
  await password(page).fill('a long enough password')
  await page.getByRole('button', { name: 'Sign in and join' }).click()
  await expect(page.getByText('Your role on this site: Viewer.')).toBeVisible()
  await expect(switcher(page).locator('option')).toHaveText(['Café · Editor', 'Shop · Viewer'])
})
