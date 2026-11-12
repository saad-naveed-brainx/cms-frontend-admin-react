import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  fakeContent,
  fulfill,
  orchard,
  person,
  profileBody,
  signedInWith,
} from './support/mock-api.ts'

/**
 * The Platform section (platform-admin T7, D-062): what a super admin sees and does, and what nobody
 * else does. The API's answers are stood in for, so every state can be made on demand; the whole
 * journey on the real API is e2e/flow/platform.spec.ts.
 */

const id = (n: number) => `0198f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const ownerOf = (n: number, name: string) => ({
  id: id(n),
  name,
  email: `${name.toLowerCase()}@x.test`,
})

const organizations = [
  {
    id: id(0xa1),
    name: 'Acme',
    status: 'active',
    owner: ownerOf(1, 'Olga'),
    pendingOwnerEmail: null,
    websites: 2,
    createdAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: id(0xa2),
    name: 'Beta',
    status: 'awaiting_owner',
    owner: null,
    pendingOwnerEmail: 'nia@x.test',
    websites: 0,
    createdAt: '2026-11-02T10:00:00.000Z',
  },
  {
    id: id(0xa3),
    name: 'Gamma',
    status: 'suspended',
    owner: ownerOf(3, 'Gus'),
    pendingOwnerEmail: null,
    websites: 1,
    createdAt: '2026-11-03T10:00:00.000Z',
  },
]

type Calls = { method: string; path: string; body: unknown }[]

/** Signs in as a super admin (or not) and answers the platform routes from `state`. */
async function asSuperAdmin(page: Page, state = { items: organizations as unknown[] }) {
  await fakeContent(page, [])
  await signedInWith(page, { memberships: [orchard], organizations: undefined })
  await page.route('**/auth/me', (route) =>
    fulfill(route, 200, {
      ...profileBody([orchard]),
      user: { ...person, isPlatformAdmin: true },
    }),
  )
  const calls: Calls = []
  const handler: Parameters<Page['route']>[1] = async (route, request) => {
    // The admin's own address looks like the API's: only calls are answered here.
    if (request.isNavigationRequest()) return route.fallback()
    const path = new URL(request.url()).pathname
    const body = request.postDataJSON() as unknown
    calls.push({ method: request.method(), path, body })
    if (request.method() === 'GET') return fulfill(route, 200, { items: state.items })
    if (request.method() === 'DELETE')
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    if (path.endsWith('/organizations') && request.method() === 'POST') {
      const made = body as { name: string; ownerEmail: string; ownerName?: string }
      return fulfill(route, 201, {
        id: id(0xb1),
        name: made.name,
        owner: null,
        ownerInvitation: {
          email: made.ownerEmail,
          name: made.ownerName ?? 'New',
          token: 'T'.repeat(43),
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
      })
    }
    return fulfill(route, 200, { id: id(0xa1), status: 'suspended' })
  }
  await page.route('**/platform/organizations**', handler)
  return { calls, state }
}

test.describe('who sees the Platform section', () => {
  test('[UC-PA-41] an ordinary owner has no Platform entry, and its address is "Not found"', async ({
    page,
  }) => {
    await fakeContent(page, [])
    await signedInWith(page, { memberships: [orchard] })
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()

    await expect(page.getByRole('link', { name: 'Platform' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'New organization' })).toHaveCount(0)
    await page.goto('/platform/organizations')
    await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible()
    await page.goto('/organizations/new')
    await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible()
  })

  test('[UC-PA-42] a super admin has Platform in the menu and sees every organization with its status', async ({
    page,
  }) => {
    const { calls } = await asSuperAdmin(page)
    await page.goto('/')

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Platform' })
      .first()
      .click()

    await expect(page).toHaveURL(/\/platform\/organizations$/)
    const table = page.getByRole('table', { name: 'Organizations' })
    await expect(table.getByRole('row')).toHaveCount(4)
    const acme = table.getByRole('row', { name: /Acme/ })
    await expect(acme).toContainText('Active')
    await expect(acme).toContainText('olga@x.test')
    await expect(acme.getByRole('cell').nth(2)).toHaveText('2')
    await expect(table.getByRole('row', { name: /Beta/ })).toContainText('Awaiting owner')
    await expect(table.getByRole('row', { name: /Beta/ })).toContainText('nia@x.test')
    await expect(table.getByRole('row', { name: /Gamma/ })).toContainText('Suspended')
    await expect(page.getByRole('button', { name: 'Reactivate Gamma' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Suspend Acme' })).toBeVisible()
    expect(calls.some((call) => call.method === 'GET')).toBe(true)
  })

  test('[UC-PA-42] with no organizations it says so and leads to New organization', async ({
    page,
  }) => {
    await asSuperAdmin(page, { items: [] })
    await page.goto('/platform/organizations')

    await expect(page.getByText('There are no organizations yet.')).toBeVisible()
    await page.getByRole('link', { name: 'Add the first one.' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'New organization' })).toBeVisible()
  })
})

test.describe('New organization', () => {
  test('[UC-PA-43] a new owner gets a one-time link with a Copy button, shown once', async ({
    page,
  }) => {
    const { calls } = await asSuperAdmin(page)
    await page.goto('/platform/organizations/new')

    await page.getByLabel('Name', { exact: true }).fill('  Delta Ltd ')
    await page.getByLabel('Owner’s email').fill('nia@x.test')
    await page.getByLabel('Owner’s name').fill('Nia')
    await page.getByRole('button', { name: 'Create organization' }).click()

    await expect(page.getByText('Delta Ltd was created.')).toBeVisible()
    await expect(page.getByText('Send this link to nia@x.test.')).toBeVisible()
    await expect(page.getByText('this is the only time it is shown')).toBeVisible()
    await expect(page.locator('.invite-link-row code')).toContainText(`/invite#${'T'.repeat(43)}`)
    await expect(page.getByRole('button', { name: /Copy/ })).toBeFocused()
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      name: 'Delta Ltd',
      ownerEmail: 'nia@x.test',
      ownerName: 'Nia',
    })
    // Leaving and coming back does not show it again: the API keeps only a fingerprint.
    await page.reload()
    await expect(page.locator('.invite-link-row code')).toHaveCount(0)
  })

  test('[UC-PA-24] one click makes one organization: the button waits while the request runs', async ({
    page,
  }) => {
    const { calls } = await asSuperAdmin(page)
    await page.unroute('**/platform/organizations**')
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/platform/organizations', async (route, request) => {
      if (request.isNavigationRequest()) return route.fallback()
      if (request.method() !== 'POST') return fulfill(route, 200, { items: [] })
      calls.push({ method: 'POST', path: '/platform/organizations', body: request.postDataJSON() })
      await gate
      return fulfill(route, 201, {
        id: id(0xb2),
        name: 'Echo',
        owner: ownerOf(9, 'Olga'),
        ownerInvitation: null,
      })
    })
    await page.goto('/platform/organizations/new')
    await page.getByLabel('Name', { exact: true }).fill('Echo')
    await page.getByLabel('Owner’s email').fill('olga@x.test')

    const create = page.getByRole('button', { name: 'Create organization' })
    await create.click()
    await expect(page.getByRole('button', { name: 'Creating…' })).toBeDisabled()
    await page
      .getByRole('button', { name: 'Creating…' })
      .click({ force: true })
      .catch(() => {})
    release()

    await expect(page.getByText('Echo was created.')).toBeVisible()
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1)
  })

  test('[UC-PA-25] a failing API is said in words, and what was typed stays', async ({ page }) => {
    await asSuperAdmin(page)
    await page.unroute('**/platform/organizations**')
    await page.route('**/platform/organizations', (route, request) =>
      request.isNavigationRequest()
        ? route.fallback()
        : request.method() === 'POST'
          ? fulfill(route, 500, { message: 'boom' })
          : fulfill(route, 200, { items: [] }),
    )
    await page.goto('/platform/organizations/new')
    await page.getByLabel('Name', { exact: true }).fill('Echo')
    await page.getByLabel('Owner’s email').fill('olga@x.test')

    await page.getByRole('button', { name: 'Create organization' }).click()

    await expect(page.getByRole('alert')).toHaveText('Something went wrong. Try again.')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Echo')
    await expect(page.getByLabel('Owner’s email')).toHaveValue('olga@x.test')
    await expect(page.getByText('Echo was created.')).toHaveCount(0)
  })

  test('[UC-PA-24] empty and over-long names are said here and nothing is sent', async ({
    page,
  }) => {
    const { calls } = await asSuperAdmin(page)
    await page.goto('/platform/organizations/new')

    await page.getByRole('button', { name: 'Create organization' }).click()
    await expect(page.getByLabel('Name', { exact: true })).toHaveAccessibleDescription(
      'Enter a name.',
    )
    await page.getByLabel('Name', { exact: true }).fill('n'.repeat(101))
    await page.getByRole('button', { name: 'Create organization' }).click()
    await expect(page.getByLabel('Name', { exact: true })).toHaveAccessibleDescription(
      'Use 100 characters or fewer.',
    )
    await page.getByLabel('Name', { exact: true }).fill('Ok')
    await page.getByRole('button', { name: 'Create organization' }).click()
    await expect(page.getByLabel('Owner’s email')).toBeFocused()
    expect(calls.filter((call) => call.method === 'POST')).toEqual([])
  })
})

test.describe('row actions', () => {
  test('[UC-PA-44] Delete asks for the exact name, Escape cancels, and the right call is made', async ({
    page,
  }) => {
    const { calls } = await asSuperAdmin(page)
    await page.goto('/platform/organizations')

    await page.getByRole('button', { name: 'Delete Acme' }).click()
    const panel = page.getByRole('region', { name: 'Delete Acme?' })
    await expect(panel).toContainText('It cannot be undone.')
    const confirm = panel.getByRole('button', { name: 'Delete this organization' })
    await expect(confirm).toBeDisabled()
    await panel.getByLabel('Type Acme to confirm').fill('acme')
    await expect(confirm).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    expect(calls.filter((call) => call.method === 'DELETE')).toEqual([])

    await page.getByRole('button', { name: 'Delete Acme' }).click()
    await panel.getByLabel('Type Acme to confirm').fill('Acme')
    await expect(confirm).toBeEnabled()
    await confirm.click()

    await expect(page.getByText('Acme was deleted.')).toBeVisible()
    expect(calls.find((call) => call.method === 'DELETE')).toMatchObject({
      path: `/platform/organizations/${id(0xa1)}`,
      body: { confirmName: 'Acme' },
    })
  })

  test('[UC-PA-42] Suspend and Reactivate call the right routes', async ({ page }) => {
    const { calls } = await asSuperAdmin(page)
    await page.goto('/platform/organizations')

    await page.getByRole('button', { name: 'Suspend Acme' }).click()
    await expect(page.getByText('Acme was suspended.')).toBeVisible()
    await page.getByRole('button', { name: 'Reactivate Gamma' }).click()
    await expect(page.getByText('Gamma was reactivated.')).toBeVisible()

    expect(calls.filter((call) => call.method === 'POST').map((call) => call.path)).toEqual([
      `/platform/organizations/${id(0xa1)}/suspend`,
      `/platform/organizations/${id(0xa3)}/reactivate`,
    ])
  })

  test('[UC-PA-43] Change owner to a new person shows the link once', async ({ page }) => {
    const { calls } = await asSuperAdmin(page)
    await page.unroute('**/platform/organizations**')
    await page.route('**/platform/organizations**', (route, request) => {
      if (request.isNavigationRequest()) return route.fallback()
      if (request.method() === 'GET') return fulfill(route, 200, { items: organizations })
      calls.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      })
      return fulfill(route, 200, {
        id: id(0xa1),
        owner: null,
        ownerInvitation: {
          email: 'nia@x.test',
          name: 'Nia',
          token: 'K'.repeat(43),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
    })
    await page.goto('/platform/organizations')

    await page.getByRole('button', { name: 'Change owner of Acme' }).click()
    await page.getByLabel('New owner’s email').fill('nia@x.test')
    await page.getByLabel('Name (only for a new person)').fill('Nia')
    await page.getByLabel('Remove the old owner from the organization’s websites').check()
    await page.getByRole('button', { name: 'Change owner', exact: true }).click()

    await expect(page.locator('.invite-link-row code')).toContainText(`/invite#${'K'.repeat(43)}`)
    expect(calls.at(-1)).toMatchObject({
      path: `/platform/organizations/${id(0xa1)}/owner`,
      body: { ownerEmail: 'nia@x.test', ownerName: 'Nia', removeOld: true },
    })
  })
})

test.describe('a suspended organization', () => {
  test('[UC-PA-45] its people see "Suspended by the platform" on every screen, and a refused save says why', async ({
    page,
  }) => {
    await fakeContent(page, [])
    await signedInWith(page, { memberships: [orchard] })
    const suspended = { id: id(0xe1), name: 'Acme', ownsOrganization: true, suspended: true }
    await page.route('**/auth/me', (route) =>
      fulfill(route, 200, {
        ...profileBody(
          [
            {
              ...orchard,
              site: { ...orchard.site, organizationId: suspended.id },
            } as typeof orchard,
          ],
          [suspended],
        ),
      }),
    )
    await page.goto('/')

    await expect(
      page.getByRole('status').filter({ hasText: 'Suspended by the platform.' }),
    ).toBeVisible()
    await page.goto('/media')
    await expect(
      page.getByRole('status').filter({ hasText: 'Suspended by the platform.' }),
    ).toBeVisible()
  })
})
