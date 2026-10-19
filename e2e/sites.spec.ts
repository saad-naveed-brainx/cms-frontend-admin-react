import { expect, test } from '@playwright/test'
import {
  fakeContent,
  fakeSites,
  fulfill,
  orchardHoldings,
  orchardSecond,
  signedInAs,
} from './support/mock-api.ts'

/**
 * The New site form in states the real API cannot be made to produce on demand (the server down, a
 * 403, a person who owns nothing, a list of sites that cannot be refreshed). The real flow is in
 * e2e/flow/sites.spec.ts.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']

const nameField = (page: import('@playwright/test').Page) =>
  page.getByLabel('Name', { exact: true })
const firstAddress = (page: import('@playwright/test').Page) =>
  page.getByLabel('Web address', { exact: true })
const secondAddress = (page: import('@playwright/test').Page) =>
  page.getByLabel('Web address 2', { exact: true })
const create = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Create site' })

test('[UC-RS-13] the form checks first: nothing is sent until the name and every address are filled', async ({
  page,
}) => {
  const session = await signedInAs(page, EVERYTHING)
  const api = await fakeSites(page, session, [orchardHoldings])
  await fakeContent(page, [])
  await page.goto('/sites/new')
  await expect(nameField(page)).toBeVisible()

  await create(page).click()
  await expect(nameField(page)).toHaveAccessibleDescription('Enter a name.')
  await expect(firstAddress(page)).toHaveAccessibleDescription('Enter a web address.')
  await expect(nameField(page)).toBeFocused()

  await nameField(page).fill('n'.repeat(121))
  await firstAddress(page).fill('cafe.test')
  await create(page).click()
  await expect(nameField(page)).toHaveAccessibleDescription('Use 120 characters or fewer.')

  // An extra address that is left empty must be filled or removed.
  await nameField(page).fill('  Orchard Cafe ')
  await page.getByRole('button', { name: 'Add another address' }).click()
  await expect(secondAddress(page)).toBeVisible()
  await create(page).click()
  await expect(secondAddress(page)).toHaveAccessibleDescription(
    'Enter a web address or remove this one.',
  )
  await expect(secondAddress(page)).toBeFocused()
  await page.getByRole('button', { name: 'Remove web address 2' }).click()
  await expect(secondAddress(page)).toHaveCount(0)
  await expect(nameField(page)).not.toHaveAccessibleDescription('Enter a name.')

  // Not one request was made for the site until now. Spaces, the scheme and the slash are tidied, and on
  // this computer `.localhost` is added (D-038); the API does the rest.
  expect(api.posted).toEqual([])
  await firstAddress(page).fill(' https://Cafe.test/ ')
  await create(page).click()
  await expect(page).toHaveURL(/\/pages$/)
  expect(api.posted).toEqual([{ name: 'Orchard Cafe', hostnames: ['Cafe.test.localhost'] }])
})

test('[UC-RS-13] a taken address is shown on the address that is taken, and what was typed stays', async ({
  page,
}) => {
  const session = await signedInAs(page, EVERYTHING)
  const api = await fakeSites(page, session, [orchardHoldings])
  api.override = (route, request) => {
    if (request.method() !== 'POST') return false
    void fulfill(route, 409, {
      message: 'The web address "taken.test.localhost" is already used by another site',
    })
    return true
  }
  await page.goto('/sites/new')

  await nameField(page).fill('Orchard Cafe')
  await firstAddress(page).fill('fresh.test')
  await page.getByRole('button', { name: 'Add another address' }).click()
  await secondAddress(page).fill('Taken.TEST:3000')
  await create(page).click()

  await expect(secondAddress(page)).toHaveAccessibleDescription(
    'That web address is already used by another site.',
  )
  await expect(secondAddress(page)).toBeFocused()
  await expect(firstAddress(page)).not.toHaveAccessibleDescription(/already used/)
  await expect(nameField(page)).toHaveValue('Orchard Cafe')
  await expect(firstAddress(page)).toHaveValue('fresh.test')
  await expect(secondAddress(page)).toHaveValue('Taken.TEST:3000')
  await expect(page).toHaveURL(/\/sites\/new$/)
})

test('[UC-RS-13] a bad address, a refusal and a server that is down are explained, and what was typed stays', async ({
  page,
}) => {
  const session = await signedInAs(page, EVERYTHING)
  const api = await fakeSites(page, session, [orchardHoldings])
  await page.goto('/sites/new')
  await nameField(page).fill('Orchard Cafe')
  await firstAddress(page).fill('a b.test')

  // The API lists the problem by field: it goes next to the address.
  api.override = (route, request) => {
    if (request.method() !== 'POST') return false
    void fulfill(route, 400, {
      message: 'Invalid request',
      errors: ['hostnames.0: "a b.test" is not a valid web address'],
    })
    return true
  }
  await create(page).click()
  await expect(firstAddress(page)).toHaveAccessibleDescription(
    '"a b.test" is not a valid web address',
  )

  api.override = (route, request) => {
    if (request.method() !== 'POST') return false
    void fulfill(route, 403, {
      message: 'Only the owner of an organisation can add a site to it',
    })
    return true
  }
  await create(page).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Only the owner of an organisation can create sites.',
  )

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

  await expect(nameField(page)).toHaveValue('Orchard Cafe')
  await expect(firstAddress(page)).toHaveValue('a b.test')
  await expect(create(page)).toBeEnabled()
  await expect(page).toHaveURL(/\/sites\/new$/)
})

test('[UC-RS-13] a person who owns no organisation is told so, and organisations that cannot load can be tried again', async ({
  page,
}) => {
  const session = await signedInAs(page, EVERYTHING)
  const api = await fakeSites(page, session, [])
  let failing = true
  api.override = (route, request) => {
    if (request.method() !== 'GET' || !failing) return false
    void route.abort('connectionrefused')
    return true
  }
  await page.goto('/sites/new')
  await expect(page.getByText("Couldn't load your organisations.")).toBeVisible()

  failing = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Only the owner of an organisation can create sites.')).toBeVisible()
  await expect(create(page)).toHaveCount(0)
})

test('[UC-RS-13] with several organisations the person must choose one, and the choice is sent', async ({
  page,
}) => {
  const session = await signedInAs(page, EVERYTHING)
  const api = await fakeSites(page, session, [orchardHoldings, orchardSecond])
  await fakeContent(page, [])
  await page.goto('/sites/new')
  await nameField(page).fill('Orchard Annex')
  await firstAddress(page).fill('annex.test')

  const organisation = page.getByLabel('Organisation')
  await expect(organisation.locator('option')).toHaveText([
    'Choose an organisation',
    'Orchard Holdings',
    'Orchard Second Ltd',
  ])
  await create(page).click()
  await expect(organisation).toHaveAccessibleDescription('Choose an organisation.')
  await expect(organisation).toBeFocused()
  expect(api.posted).toEqual([])

  await organisation.selectOption({ label: 'Orchard Second Ltd' })
  await create(page).click()
  await expect(page).toHaveURL(/\/pages$/)
  expect(api.posted).toEqual([
    {
      name: 'Orchard Annex',
      hostnames: ['annex.test.localhost'],
      organizationId: orchardSecond.id,
    },
  ])
})

test('[UC-RS-13] a person with no sites can still create one, and lands on it', async ({
  page,
}) => {
  const session = await signedInAs(page, EVERYTHING, { sites: false })
  await fakeSites(page, session, [orchardHoldings])
  await fakeContent(page, [])
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'No sites yet' })).toBeVisible()

  // With no membership nothing says they own an organisation, so the top bar has no New site
  // (users-roles D11); the screen itself is still routed for them.
  await page.goto('/sites/new')
  await nameField(page).fill('First Site')
  await firstAddress(page).fill('first.test')
  await create(page).click()

  await expect(page).toHaveURL(/\/pages$/)
  await expect(page.getByText('Site created.')).toBeVisible()
  await expect(page.getByText('No pages yet.')).toBeVisible()
  await expect(page.getByRole('banner')).toContainText('First Site')
})

test('[UC-RS-13] a site that was created but whose arrival cannot be confirmed says so, and is not created twice', async ({
  page,
}) => {
  const session = await signedInAs(page, EVERYTHING)
  const api = await fakeSites(page, session, [orchardHoldings])
  await page.goto('/sites/new')
  await nameField(page).fill('Orchard Cafe')
  await firstAddress(page).fill('cafe.test')

  session.meFails = true
  await create(page).click()
  await expect(
    page.getByText('“Orchard Cafe” was created, but your list of sites could not be refreshed.'),
  ).toBeVisible()
  await expect(create(page)).toHaveCount(0)
  expect(api.posted).toHaveLength(1)
})

test('[UC-LA-01] on this computer the hint says .localhost is added for you; on a live server it does not', async ({
  page,
}) => {
  const session = await signedInAs(page, EVERYTHING)
  await fakeSites(page, session, [orchardHoldings])
  await fakeContent(page, [])
  await page.goto('/sites/new')
  await expect(nameField(page)).toBeVisible()
  await expect(page.locator('#address-hint')).toContainText(
    'On this computer .localhost is added for you (cafe is saved as cafe.localhost)',
  )

  // The same check, for the addresses an admin can be opened at.
  // The module as the browser loads it from the dev server; a path given at run time, so TypeScript leaves it be.
  const answers = await page.evaluate(async (module) => {
    const { onThisComputer } = (await import(module)) as {
      onThisComputer: (hostname: string) => boolean
    }
    const hosts = [
      'localhost',
      '127.0.0.1',
      '[::1]',
      'admin.localhost',
      'admin.example.com',
      'localhost.example.com',
    ]
    return hosts.map((hostname) => [hostname, onThisComputer(hostname)])
  }, '/src/site-links.ts')
  expect(answers).toEqual([
    ['localhost', true],
    ['127.0.0.1', true],
    ['[::1]', true],
    ['admin.localhost', true],
    ['admin.example.com', false],
    ['localhost.example.com', false],
  ])
})

test('[UC-LA-02] on this computer .localhost is added to every address, shown before it is saved; on a live server addresses are kept as typed', async ({
  page,
}) => {
  const session = await signedInAs(page, EVERYTHING)
  const api = await fakeSites(page, session, [orchardHoldings])
  await fakeContent(page, [])
  await page.goto('/sites/new')
  await nameField(page).fill('Shop')
  await firstAddress(page).fill('xyz')
  await expect(firstAddress(page)).toHaveAccessibleDescription(/^Will be saved as xyz\.localhost\./)
  await page.getByRole('button', { name: 'Add another address' }).click()
  await secondAddress(page).fill('shop.localhost')
  await expect(page.getByText('Will be saved as')).toHaveCount(1)
  await page.getByRole('button', { name: 'Add another address' }).click()
  await page.getByLabel('Web address 3', { exact: true }).fill('https://Cafe.Example.com:3000/')
  await expect(page.getByText('Will be saved as Cafe.Example.com.localhost.')).toBeVisible()

  await create(page).click()
  await expect(page).toHaveURL(/\/pages$/)
  expect(api.posted).toEqual([
    { name: 'Shop', hostnames: ['xyz.localhost', 'shop.localhost', 'Cafe.Example.com.localhost'] },
  ])

  // The rule itself, on this computer and on a live server.
  const saved = await page.evaluate(async (module) => {
    const { savedAddress } = (await import(module)) as {
      savedAddress: (tidied: string, local: boolean) => string
    }
    const typed = [
      'xyz',
      'cafe.example.com',
      'cafe.test:3000',
      'cafe.',
      'bakery.localhost',
      'localhost',
      '',
    ]
    return {
      here: typed.map((address) => savedAddress(address, true)),
      live: typed.map((address) => savedAddress(address, false)),
    }
  }, '/src/helpers.ts')
  expect(saved.here).toEqual([
    'xyz.localhost',
    'cafe.example.com.localhost',
    'cafe.test.localhost',
    'cafe.localhost',
    'bakery.localhost',
    'localhost',
    '',
  ])
  expect(saved.live).toEqual([
    'xyz',
    'cafe.example.com',
    'cafe.test:3000',
    'cafe.',
    'bakery.localhost',
    'localhost',
    '',
  ])
})

test('[UC-DP-01] on the live admin a one-word address is saved under the platform domain; a full address is kept as typed', async ({
  page,
}) => {
  const session = await signedInAs(page, EVERYTHING)
  await fakeSites(page, session, [orchardHoldings])
  await fakeContent(page, [])
  await page.goto('/sites/new')
  await expect(nameField(page)).toBeVisible()

  // The rule, on a live admin with VITE_SITE_DOMAIN set, with none, and on this computer.
  const saved = await page.evaluate(
    async ([helpers, links]) => {
      const { savedAddress } = (await import(helpers)) as {
        savedAddress: (tidied: string, local: boolean, domain?: string) => string
      }
      const { domainSetting } = (await import(links)) as {
        domainSetting: (value: unknown) => string
      }
      const typed = ['bistro', 'Bistro:3000', 'cafe.example.com', 'cafe.', '']
      const domain = 'nodepress.example.test'
      return {
        live: typed.map((address) => savedAddress(address, false, domain)),
        noDomain: typed.map((address) => savedAddress(address, false, '')),
        here: typed.map((address) => savedAddress(address, true, domain)),
        settings: [
          ' .NodePress.Example.TEST ',
          'nodepress.example.test',
          'not a domain',
          'https://nodepress.example.test',
          '',
          undefined,
        ].map(domainSetting),
      }
    },
    ['/src/helpers.ts', '/src/site-links.ts'],
  )
  expect(saved.live).toEqual([
    'bistro.nodepress.example.test',
    'Bistro.nodepress.example.test',
    'cafe.example.com',
    'cafe.',
    '',
  ])
  expect(saved.noDomain).toEqual(['bistro', 'Bistro:3000', 'cafe.example.com', 'cafe.', ''])
  expect(saved.here).toEqual([
    'bistro.localhost',
    'Bistro.localhost',
    'cafe.example.com.localhost',
    'cafe.localhost',
    '',
  ])
  expect(saved.settings).toEqual([
    'nodepress.example.test',
    'nodepress.example.test',
    '',
    '',
    '',
    '',
  ])
})
