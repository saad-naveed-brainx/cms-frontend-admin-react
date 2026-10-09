import { expect, test } from '@playwright/test'
import type { Request, Route } from '@playwright/test'
import { fakeContent, fakePage, fulfill, person, signedInAs } from './support/mock-api.ts'

/**
 * The page screens in states the real API cannot be made to produce on demand (the server down, a
 * 403, a 401 in the middle of the work) and for roles the seed cannot make (a viewer, an author).
 * The real flow is in e2e/flow/pages.spec.ts.
 */

const EVERYTHING = ['content.create', 'content.edit_any', 'content.edit_own']
const SOMEONE_ELSE = '0198f2a0-0000-7000-8000-0000000000ee'

/** The list request: `GET /content`. */
const readsTheList = (request: Request) =>
  request.method() === 'GET' && new URL(request.url()).pathname === '/content'

for (const [who, permissions, offered] of [
  ['someone who may create', EVERYTHING, true],
  ['a viewer', [], false],
] as const) {
  test(`[UC-CS-07] an empty list says so, and ${who} ${offered ? 'is offered' : 'is not offered'} a first page`, async ({
    page,
  }) => {
    await fakeContent(page, [])
    await signedInAs(page, [...permissions])
    await page.goto('/pages')

    await expect(page.getByText('No pages yet.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create the first page' })).toHaveCount(
      offered ? 1 : 0,
    )
    await expect(page.getByRole('link', { name: 'New page' })).toHaveCount(offered ? 1 : 0)
  })
}

test('[UC-CS-08] a list that cannot load says so, and Try again loads it', async ({ page }) => {
  const api = await fakeContent(page, [fakePage(1, { title: 'Welcome' })])
  await signedInAs(page, EVERYTHING)
  api.override = (route, request) => {
    if (!readsTheList(request)) return false
    void route.abort('connectionrefused')
    return true
  }
  await page.goto('/pages')
  await expect(page.getByText("Couldn't load pages.")).toBeVisible()

  api.override = null
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('link', { name: 'Welcome' })).toBeVisible()
})

test('[UC-CS-08] a 401 in the middle of the work ends the session', async ({ page }) => {
  const api = await fakeContent(page, [])
  await signedInAs(page, EVERYTHING)
  api.override = (route, request) => {
    if (!readsTheList(request)) return false
    void fulfill(route, 401, { message: 'Unauthorized' })
    return true
  }
  await page.goto('/pages')

  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Your session has ended. Sign in again.')
})

test('[UC-CS-09] the form checks first, and shows plainly what the API says', async ({ page }) => {
  const api = await fakeContent(page, [])
  await signedInAs(page, EVERYTHING)
  await page.goto('/pages/new')
  const title = page.getByLabel('Title', { exact: true })
  const slug = page.getByLabel('Slug')
  const create = page.getByRole('button', { name: 'Create page' })

  // Checked before anything is sent.
  await create.click()
  await expect(title).toHaveAccessibleDescription('Enter a title.')
  await expect(title).toBeFocused()
  await title.fill('Hello')
  await slug.fill('Bad Slug')
  await create.click()
  await expect(slug).toHaveAccessibleDescription(
    'Use lower-case letters, digits and single hyphens, up to 80 characters.',
  )
  expect(api.calls.filter((call) => call.startsWith('POST'))).toEqual([])

  // Then each answer the API can give, with what was typed kept.
  await slug.fill('hello')
  const answers: {
    what: string
    reply: (route: Parameters<typeof fulfill>[0]) => unknown
    check: () => Promise<void>
  }[] = [
    {
      what: 'a 400 with lines by field',
      reply: (route) =>
        fulfill(route, 400, {
          message: 'Invalid request',
          errors: ['title: Too short.', 'slug: Not allowed.'],
        }),
      check: async () => {
        await expect(title).toHaveAccessibleDescription('Too short.')
        await expect(slug).toHaveAccessibleDescription('Not allowed.')
      },
    },
    {
      what: 'a 403',
      reply: (route) => fulfill(route, 403, { message: 'Forbidden' }),
      check: () =>
        expect(page.getByRole('alert')).toHaveText("You don't have permission to do that."),
    },
    {
      what: 'a 409',
      reply: (route) => fulfill(route, 409, { message: 'The address /hello is already used' }),
      check: () =>
        expect(slug).toHaveAccessibleDescription('That address is already used by another page.'),
    },
    {
      what: 'a 500',
      reply: (route) => fulfill(route, 500, { message: 'boom' }),
      check: () => expect(page.getByRole('alert')).toHaveText('Something went wrong. Try again.'),
    },
    {
      what: 'no connection',
      reply: (route) => route.abort('connectionrefused'),
      check: () =>
        expect(page.getByRole('alert')).toHaveText(
          "Can't reach the server. Check your connection and try again.",
        ),
    },
  ]
  for (const answer of answers) {
    api.override = (route, request) => {
      if (request.method() !== 'POST') return false
      void answer.reply(route)
      return true
    }
    await create.click()
    await answer.check()
    await expect(title, answer.what).toHaveValue('Hello')
    await expect(slug, answer.what).toHaveValue('hello')
  }
})

const roles = [
  { who: 'a viewer', permissions: [], canCreate: false, ownEditable: false, otherEditable: false },
  {
    who: 'an author',
    permissions: ['content.create', 'content.edit_own'],
    canCreate: true,
    ownEditable: true,
    otherEditable: false,
  },
  {
    who: 'an editor',
    permissions: ['content.create', 'content.edit_any'],
    canCreate: true,
    ownEditable: true,
    otherEditable: true,
  },
]

for (const role of roles) {
  test(`[UC-CS-10] ${role.who} is offered only what their role allows`, async ({ page }) => {
    const own = fakePage(1, { title: 'Mine', createdBy: person.id })
    const other = fakePage(2, { title: 'Theirs', createdBy: SOMEONE_ELSE })
    await fakeContent(page, [own, other])
    await signedInAs(page, role.permissions)

    await page.goto('/pages')
    await expect(page.getByRole('link', { name: 'New page' })).toHaveCount(role.canCreate ? 1 : 0)

    await page.goto('/pages/new')
    if (role.canCreate) {
      await expect(page.getByLabel('Title', { exact: true })).toBeVisible()
    } else {
      await expect(
        page.getByText("You don't have permission to create pages on this site."),
      ).toBeVisible()
    }

    for (const [item, editable] of [
      [own, role.ownEditable],
      [other, role.otherEditable],
    ] as const) {
      await page.goto(`/pages/${item.id}`)
      await expect(page.getByRole('heading', { level: 1, name: item.title })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save' }), item.title).toHaveCount(
        editable ? 1 : 0,
      )
      await expect(page.getByText('You can read this page but not change it.')).toHaveCount(
        editable ? 0 : 1,
      )
      if (editable) await expect(page.getByLabel('Title', { exact: true })).toBeEditable()
      else await expect(page.getByLabel('Title', { exact: true })).not.toBeEditable()
    }
  })
}

for (const id of ['0198f2a0-0000-7000-8000-0000000009ff', 'not-an-id']) {
  test(`[UC-CS-11] /pages/${id} is not found, with a way back`, async ({ page }) => {
    await fakeContent(page, [fakePage(1)])
    await signedInAs(page, EVERYTHING)
    await page.goto(`/pages/${id}`)

    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to pages' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'All content' })).toBeVisible()
  })
}

test('[UC-CS-12] the slug follows the title until it is edited by hand, and the address follows the type', async ({
  page,
}) => {
  await fakeContent(page, [])
  await signedInAs(page, EVERYTHING)
  await page.goto('/pages/new')
  const title = page.getByLabel('Title', { exact: true })
  const slug = page.getByLabel('Slug')

  await title.fill('Our Café & Bar!')
  await expect(slug).toHaveValue('our-cafe-bar')
  await expect(page.getByText('Address: /our-cafe-bar')).toBeVisible()

  await slug.fill('custom')
  await title.fill('Another title')
  await expect(slug).toHaveValue('custom')

  await page.getByLabel('Type').selectOption('post')
  await expect(page.getByText('Address: /blog/custom')).toBeVisible()
  await page.getByLabel('Type').selectOption('page')
  await expect(page.getByText('Address: /custom')).toBeVisible()
})

for (const [who, permissions, offered] of [
  ['a viewer', [], false],
  ['an author', ['content.create', 'content.edit_own'], false],
  ['an editor without publish', ['content.edit_any'], false],
  ['a publisher', ['content.edit_any', 'content.publish'], true],
] as const) {
  test(`[UC-RS-07] ${who} ${offered ? 'is offered' : 'is not offered'} Publish`, async ({ page }) => {
    const draft = fakePage(1, { title: 'Draft page' })
    await fakeContent(page, [draft])
    await signedInAs(page, [...permissions])
    await page.goto(`/pages/${draft.id}`)

    await expect(page.getByRole('heading', { level: 1, name: 'Draft page' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(
      offered ? 1 : 0,
    )
    await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toHaveCount(0)
  })
}

test('[UC-RS-07] a refused or impossible publish is shown plainly and changes nothing', async ({
  page,
}) => {
  const draft = fakePage(1, { title: 'Draft page' })
  const live = fakePage(2, { title: 'Live page', status: 'published' })
  const api = await fakeContent(page, [draft, live])
  await signedInAs(page, [...EVERYTHING, 'content.publish'])
  const answer = (status: number) => (route: Route, request: Request) => {
    if (request.method() !== 'POST') return false
    void fulfill(route, status, { message: 'no' })
    return true
  }

  await page.goto(`/pages/${draft.id}`)
  api.override = answer(403)
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText("You don't have permission to do that.")
  await expect(page.locator('dl.facts')).toContainText('Draft')

  await page.goto(`/pages/${live.id}`)
  api.override = answer(409)
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('This page is not published.')

  // And when it works, the status and the message follow.
  api.override = null
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
  await expect(page.getByText('Unpublished.', { exact: true })).toBeVisible()
  await expect(page.locator('dl.facts')).toContainText('Draft')
})
