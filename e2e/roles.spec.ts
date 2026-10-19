import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  fakeContent,
  fakeMedia,
  fakePage,
  maple,
  orchard,
  person,
  signedInAs,
} from './support/mock-api.ts'

/**
 * The admin following the role (users-roles, T6): each of the five roles, with the permissions the
 * API gives it, sees only what it may use. Hidden buttons are a convenience; the API refuses on its
 * own (admin rule 3). The Users entry is tested with the Users screen, not here.
 */

const ROLES = {
  Administrator: [
    'content.create',
    'content.edit_own',
    'content.edit_any',
    'content.publish',
    'content.publish_own',
    'content.delete',
    'media.upload',
    'media.delete',
    'terms.manage',
    'menus.manage',
    'redirects.manage',
    'forms.view',
    'members.manage',
    'settings.manage',
    'content_types.manage',
  ],
  Editor: [
    'content.create',
    'content.edit_own',
    'content.edit_any',
    'content.publish',
    'content.delete',
    'media.upload',
    'media.delete',
    'terms.manage',
    'menus.manage',
    'redirects.manage',
    'forms.view',
  ],
  Author: ['content.create', 'content.edit_own', 'content.publish_own', 'media.upload'],
  Contributor: ['content.create', 'content.edit_own'],
  Viewer: [],
} as const

type Role = keyof typeof ROLES

const SOMEONE_ELSE = { id: '0198f2a0-0000-7000-8000-0000000000ee', name: 'Rosa Rowe' }

/** What each role is offered. */
const OFFERED: Record<
  Role,
  {
    settings: boolean
    upload: boolean
    publishOwn: boolean
    publishAny: boolean
    editOwn: boolean
    editAny: boolean
  }
> = {
  Administrator: {
    settings: true,
    upload: true,
    publishOwn: true,
    publishAny: true,
    editOwn: true,
    editAny: true,
  },
  Editor: {
    settings: false,
    upload: true,
    publishOwn: true,
    publishAny: true,
    editOwn: true,
    editAny: true,
  },
  Author: {
    settings: false,
    upload: true,
    publishOwn: true,
    publishAny: false,
    editOwn: true,
    editAny: false,
  },
  Contributor: {
    settings: false,
    upload: false,
    publishOwn: false,
    publishAny: false,
    editOwn: true,
    editAny: false,
  },
  Viewer: {
    settings: false,
    upload: false,
    publishOwn: false,
    publishAny: false,
    editOwn: false,
    editAny: false,
  },
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Main' })
const publish = (page: Page) => page.getByRole('button', { name: 'Publish', exact: true })
const unpublish = (page: Page) => page.getByRole('button', { name: 'Unpublish', exact: true })

const mine = fakePage(1, {
  title: 'Mine',
  createdBy: person.id,
  author: { id: person.id, name: person.name },
})
const theirs = fakePage(2, {
  title: 'Theirs',
  createdBy: SOMEONE_ELSE.id,
  author: SOMEONE_ELSE,
})
const theirsLive = fakePage(3, {
  title: 'Theirs live',
  status: 'published',
  publishedAt: '2026-10-05T10:00:00.000Z',
  createdBy: SOMEONE_ELSE.id,
  author: SOMEONE_ELSE,
})
const nobodys = fakePage(4, { title: 'Imported', createdBy: null, author: null })

for (const role of Object.keys(ROLES) as Role[]) {
  const offered = OFFERED[role]

  test(`[UC-UR-24] ${role}: the menu, the Pages list and Media offer only what the role allows`, async ({
    page,
  }) => {
    await fakeContent(page, [mine, theirs, theirsLive, nobodys])
    await fakeMedia(page, [])
    await signedInAs(page, [...ROLES[role]], { role })

    // Menu: Appearance and Content types by permission, Media for everyone.
    await expect(menu(page).getByRole('link', { name: 'Media' })).toBeVisible()
    await expect(menu(page).getByRole('link', { name: 'Appearance' })).toHaveCount(
      offered.settings ? 1 : 0,
    )
    await expect(menu(page).getByRole('link', { name: 'Content types' })).toHaveCount(
      offered.settings ? 1 : 0,
    )

    // Pages list: an Author column with each page's author, and "—" where there is none.
    await page.goto('/pages')
    await expect(page.getByRole('columnheader', { name: 'Author' })).toBeVisible()
    await expect(
      page.getByRole('row', { name: /^Mine/ }).getByRole('cell', { name: person.name, exact: true }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('row', { name: /^Theirs live/ })
        .getByRole('cell', { name: SOMEONE_ELSE.name, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: /^Imported/ }).getByRole('cell', { name: '—', exact: true }),
    ).toBeVisible()

    // Media: Add New Media File only with media.upload.
    await page.goto('/media')
    await expect(page.getByRole('heading', { level: 1, name: 'Media Library' })).toBeVisible()
    await expect(page.getByLabel('Add New Media File')).toHaveCount(offered.upload ? 1 : 0)
  })

  test(`[UC-UR-24] ${role}: Publish and editing on their own page and on someone else's`, async ({
    page,
  }) => {
    await fakeContent(page, [mine, theirs, theirsLive])
    await signedInAs(page, [...ROLES[role]], { role })

    for (const [item, publishable, editable] of [
      [mine, offered.publishOwn, offered.editOwn],
      [theirs, offered.publishAny, offered.editAny],
    ] as const) {
      await page.goto(`/pages/${item.id}`)
      await expect(page.getByRole('heading', { level: 1, name: item.title })).toBeVisible()
      await expect(publish(page), `Publish on ${item.title}`).toHaveCount(publishable ? 1 : 0)
      if (editable) {
        await expect(page.getByLabel('Title', { exact: true })).toBeEditable()
      } else {
        await expect(page.getByText('You can read this page but not change it.')).toBeVisible()
        await expect(page.getByLabel('Title', { exact: true })).not.toBeEditable()
        await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
      }
    }

    // Someone else's published page: Unpublish follows the same rule as Publish.
    await page.goto(`/pages/${theirsLive.id}`)
    await expect(page.getByRole('heading', { level: 1, name: theirsLive.title })).toBeVisible()
    await expect(unpublish(page)).toHaveCount(offered.publishAny ? 1 : 0)
  })

  test(`[UC-UR-24] ${role}: "Publish the front page" on the Dashboard only where publishing someone else's home page is allowed`, async ({
    page,
  }) => {
    await fakeContent(page, [
      fakePage(5, {
        title: 'Home',
        slug: 'home',
        createdBy: SOMEONE_ELSE.id,
        author: SOMEONE_ELSE,
      }),
    ])
    await signedInAs(page, [...ROLES[role]], { role })
    await page.goto('/')

    const notice = page.getByRole('region', { name: 'Your front page is not published' })
    await expect(notice).toBeVisible()
    await expect(notice.getByRole('button', { name: 'Publish the front page' })).toHaveCount(
      offered.publishAny ? 1 : 0,
    )
  })
}

test('[UC-UR-24] an Author publishes their own page, and can unpublish it again', async ({
  page,
}) => {
  const draft = fakePage(6, { title: 'My draft', createdBy: person.id })
  const api = await fakeContent(page, [draft])
  await signedInAs(page, [...ROLES.Author], { role: 'Author' })
  await page.goto(`/pages/${draft.id}`)

  await expect(publish(page)).toBeVisible()
  await publish(page).click()
  await expect(unpublish(page)).toBeVisible()
  expect(api.pages[0].status).toBe('published')
  expect(api.calls).toContain(`POST /content/${draft.id}/publish`)
})

test('[UC-UR-24] an Author who created the home page is offered "Publish the front page"', async ({
  page,
}) => {
  await fakeContent(page, [fakePage(7, { title: 'Home', slug: 'home', createdBy: person.id })])
  await signedInAs(page, [...ROLES.Author], { role: 'Author' })
  await page.goto('/')

  const notice = page.getByRole('region', { name: 'Your front page is not published' })
  await expect(notice.getByRole('button', { name: 'Publish the front page' })).toBeVisible()
})

for (const [who, memberships, offered] of [
  ['someone who owns no organisation', [{ ...orchard, ownsOrganization: false }], false],
  [
    'someone whose membership does not say',
    [{ ...orchard, role: { ...orchard.role, name: 'Editor' } }],
    false,
  ],
  [
    'someone who owns the organisation of another of their sites',
    [
      { ...orchard, ownsOrganization: false },
      { ...maple, ownsOrganization: true },
    ],
    true,
  ],
] as const) {
  test(`[UC-UR-24] New site in the top bar: ${who} ${offered ? 'sees it' : 'does not'}`, async ({
    page,
  }) => {
    await fakeContent(page, [])
    const session = await signedInAs(page, [...ROLES.Editor], { role: 'Editor' })
    session.memberships = memberships.map((item) => ({ ...item }))
    await page.reload()

    const bar = page.getByRole('banner')
    await expect(bar).toContainText('Howdy, Olivia Orchard')
    await expect(bar.getByRole('link', { name: 'New site' })).toHaveCount(offered ? 1 : 0)
  })
}
