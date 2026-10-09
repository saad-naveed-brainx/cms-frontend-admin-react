import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  SESSION_KEY,
  authCalls,
  fulfill,
  inDays,
  loginBody,
  orchard,
  profileBody,
  readStorage,
  seedStorage,
} from './support/mock-api.ts'

/**
 * Sign-in states the real API cannot be made to produce on demand, so its answers are replaced
 * here. The real flow (a real account, a real login) is in e2e/flow/sign-in.spec.ts.
 */

const UNREACHABLE = "Can't reach the server. Check your connection and try again."
const WENT_WRONG = 'Something went wrong. Try again.'
const ENDED = 'Your session has ended. Sign in again.'

const signInHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: 'Sign in' })
const siteHeading = (page: Page, name: string) =>
  page.getByRole('heading', { name, exact: true })

async function fillAndSubmit(page: Page, email = 'olivia@orchard.test', password = 'a password') {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('[UC-AS-06] empty and malformed fields are explained and never sent', async ({ page }) => {
  const calls = authCalls(page)
  await page.goto('/')
  const email = page.getByLabel('Email')
  const password = page.getByLabel('Password')
  const submit = page.getByRole('button', { name: 'Sign in' })

  // Nothing filled in: each field says what is missing, and the first gets the cursor.
  await submit.click()
  await expect(email).toHaveAccessibleDescription('Enter your email address.')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(password).toHaveAccessibleDescription('Enter your password.')
  await expect(email).toBeFocused()

  // Spaces only, then a typo.
  await email.fill('   ')
  await submit.click()
  await expect(email).toHaveAccessibleDescription('Enter your email address.')
  await email.fill('not-an-email')
  await submit.click()
  await expect(email).toHaveAccessibleDescription('Enter a valid email address.')

  // A good email and no password: only the password is left to fix, and it gets the cursor.
  await email.fill('olivia@orchard.test')
  await submit.click()
  await expect(email).toHaveAttribute('aria-invalid', 'false')
  await expect(password).toBeFocused()

  expect(calls).toEqual([])
})

test('[UC-AS-07] an unreachable server is explained, and signing in works once it is back', async ({
  page,
}) => {
  let online = false
  await page.route('**/auth/login', (route) =>
    online ? fulfill(route, 200, loginBody()) : route.abort('connectionrefused'),
  )
  await page.goto('/')

  await fillAndSubmit(page)
  await expect(page.getByRole('alert')).toHaveText(UNREACHABLE)
  await expect(page.getByLabel('Email')).toHaveValue('olivia@orchard.test')
  await expect(page.getByLabel('Password')).toHaveValue('')
  await expect(page.getByLabel('Password')).toBeFocused()
  expect(await readStorage(page, SESSION_KEY)).toBeNull()

  online = true
  await page.getByLabel('Password').fill('a password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(siteHeading(page, 'Orchard Bakery')).toBeVisible()
})

test('[UC-AS-08] a server error or an unusable answer says something went wrong and stores nothing', async ({
  page,
}) => {
  const cases = [
    { what: 'a 500', status: 500, body: { message: 'boom' }, type: 'application/json' },
    { what: 'a 503 page', status: 503, body: '<html>maintenance</html>', type: 'text/html' },
    { what: 'a 400', status: 400, body: { message: 'bad request' }, type: 'application/json' },
    { what: 'an empty 200', status: 200, body: {}, type: 'application/json' },
    {
      what: 'a 200 whose memberships are not a list',
      status: 200,
      body: { ...loginBody(), memberships: 'none' },
      type: 'application/json',
    },
    { what: 'a 200 that is not JSON', status: 200, body: 'ok', type: 'text/plain' },
  ]
  let reply = cases[0]
  await page.route('**/auth/login', (route) =>
    fulfill(route, reply.status, reply.body, reply.type),
  )
  await page.goto('/')

  for (const current of cases) {
    reply = current
    // Wait for the answer first, so the alert checked is the new one and not the previous case's.
    await Promise.all([page.waitForResponse('**/auth/login'), fillAndSubmit(page)])
    await expect(page.getByRole('alert'), current.what).toHaveText(WENT_WRONG)
    expect(await readStorage(page, SESSION_KEY), current.what).toBeNull()
  }
})

const unusableSessions = [
  {
    name: 'a session past its expiry',
    value: JSON.stringify({ accessToken: 'old-token', expiresAt: '2020-01-01T00:00:00.000Z' }),
    notice: true,
    asksTheApi: false,
  },
  { name: 'a stored value that is not JSON', value: 'not json at all', notice: false, asksTheApi: false },
  {
    name: 'a stored value of the wrong shape',
    value: JSON.stringify({ accessToken: 5 }),
    notice: false,
    asksTheApi: false,
  },
  {
    name: 'a token the server rejects',
    value: JSON.stringify({ accessToken: 'rejected-token', expiresAt: inDays(1) }),
    notice: true,
    asksTheApi: true,
  },
]

for (const saved of unusableSessions) {
  test(`[UC-AS-09] ${saved.name} leads to the sign-in screen and is removed`, async ({ page }) => {
    const calls = authCalls(page)
    await page.route('**/auth/me', (route) => fulfill(route, 401, { message: 'Unauthorized' }))
    await seedStorage(page, { [SESSION_KEY]: saved.value })

    await expect(signInHeading(page)).toBeVisible()
    if (saved.notice) await expect(page.getByRole('status')).toHaveText(ENDED)
    else await expect(page.getByRole('status')).toHaveCount(0)
    expect(await readStorage(page, SESSION_KEY)).toBeNull()
    expect(calls.some((call) => call.path === '/auth/me')).toBe(saved.asksTheApi)
  })
}

for (const trouble of ['cannot be reached', 'answers with an error']) {
  test(`[UC-AS-10] a saved session is kept when the server ${trouble}, and Try again works`, async ({
    page,
  }) => {
    let reply: 'down' | 'error' | 'ok' = trouble === 'cannot be reached' ? 'down' : 'error'
    await page.route('**/auth/me', (route) => {
      if (reply === 'down') return route.abort('connectionrefused')
      return reply === 'error'
        ? fulfill(route, 500, { message: 'boom' })
        : fulfill(route, 200, profileBody())
    })
    await seedStorage(page, {
      [SESSION_KEY]: JSON.stringify({ accessToken: 'saved-token', expiresAt: inDays(1) }),
    })

    await expect(
      page.getByRole('heading', { level: 1, name: "We couldn't check your session" }),
    ).toBeVisible()
    expect(await readStorage(page, SESSION_KEY)).not.toBeNull()

    reply = 'ok'
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(siteHeading(page, 'Orchard Bakery')).toBeVisible()
  })
}

test('[UC-AS-11] an account with no sites is told why there is nothing to work on, and can sign out', async ({
  page,
}) => {
  await page.route('**/auth/login', (route) => fulfill(route, 200, loginBody([])))
  await page.goto('/')
  await fillAndSubmit(page)

  await expect(siteHeading(page, 'No sites yet')).toBeVisible()
  await expect(
    page.getByText('Your account is not a member of any site. Ask an administrator to add you.'),
  ).toBeVisible()
  await expect(page.getByLabel('Site')).toHaveCount(0)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(signInHeading(page)).toBeVisible()
})

test('[UC-AS-12] one sign-in request at a time: the button waits, and Enter twice sends one', async ({
  page,
}) => {
  let requests = 0
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/auth/login', async (route) => {
    requests += 1
    await held
    await fulfill(route, 200, loginBody())
  })
  await page.goto('/')
  await page.getByLabel('Email').fill('olivia@orchard.test')
  const password = page.getByLabel('Password')
  await password.fill('a password')

  await password.press('Enter')
  await expect(page.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
  await password.press('Enter')

  release()
  await expect(siteHeading(page, 'Orchard Bakery')).toBeVisible()
  expect(requests).toBe(1)
})

test('[UC-AS-16] with one site there is no switcher, only the site name', async ({ page }) => {
  await page.route('**/auth/login', (route) => fulfill(route, 200, loginBody([orchard])))
  await page.goto('/')
  await fillAndSubmit(page)

  await expect(siteHeading(page, 'Orchard Bakery')).toBeVisible()
  await expect(page.getByLabel('Site')).toHaveCount(0)
  await expect(page.getByRole('banner')).toContainText('Orchard Bakery')
})
