import { randomBytes } from 'node:crypto'
import type { Page, Request, Route } from '@playwright/test'
import { flowApiPort } from '../flow/env.ts'

/**
 * Helpers for the tests that do NOT use the real API: they answer the API's calls themselves, for
 * states the real one cannot be made to produce on demand (server down, a 500, a slow answer, an
 * account with no sites) and for screenshots that must look the same every time. The real flow is
 * in e2e/flow/. The shapes below mirror api/src/auth/auth.service.ts.
 */

export const SESSION_KEY = 'cms-admin.session'
export const SITE_KEY = 'cms-admin.site'
export const ORGANIZATION_KEY = 'cms-admin.org'

export const person = {
  id: '0198f2a0-0000-7000-8000-0000000000f1',
  email: 'olivia@orchard.test',
  name: 'Olivia Orchard',
}

export const orchard = {
  site: {
    id: '0198f2a0-0000-7000-8000-000000000001',
    name: 'Orchard Bakery',
    primaryHost: 'orchard.test' as string | null,
    /** As stored: laid over the default theme, as the website does. The live preview draws with it. */
    theme: { typeSet: 'editorial', palette: { paper: '#fffaf0', brand: '#8a3b12' } } as object,
  },
  role: { id: '0198f2a0-0000-7000-8000-0000000000a1', name: 'Administrator' },
  permissions: ['content.read', 'content.write', 'members.manage'],
}

export const maple = {
  site: {
    id: '0198f2a0-0000-7000-8000-000000000002',
    name: 'Maple Books',
    primaryHost: 'maple.test' as string | null,
    theme: {} as object,
  },
  role: { id: '0198f2a0-0000-7000-8000-0000000000a2', name: 'Editor' },
  permissions: ['content.read', 'content.write'],
}

export const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString()

/** An organization as `/auth/me` and sign-in list it (organizations T1). */
export type MockOrganization = { id: string; name: string; ownsOrganization: boolean }

/**
 * The profile as the API answers it. Without `organizations` it is the API before organizations (no
 * `organizations`, no `organizationId` on a site): the admin then shows the flat Site switcher, and
 * every test written before organizations runs against that answer (UC-OR-18).
 */
export const profileBody = (
  memberships = [orchard, maple],
  organizations?: MockOrganization[],
) => ({
  user: person,
  memberships,
  ...(organizations === undefined ? {} : { organizations }),
})

export const loginBody = (memberships = [orchard, maple], organizations?: MockOrganization[]) => ({
  accessToken: 'mock-access-token',
  tokenType: 'Bearer',
  expiresAt: inDays(7),
  ...profileBody(memberships, organizations),
})

/** Answers a call with a status and a body. The API is another origin, so the answer says it may be read. */
export function fulfill(
  route: Route,
  status: number,
  body: unknown,
  contentType = 'application/json',
) {
  return route.fulfill({
    status,
    contentType,
    headers: { 'access-control-allow-origin': '*' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** Every call the page makes to the API's /auth/ routes, in order. */
export function authCalls(page: Page) {
  const calls: { method: string; path: string; headers: Record<string, string> }[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/auth/')) {
      calls.push({ method: request.method(), path: pathname, headers: request.headers() })
    }
  })
  return calls
}

export const readStorage = (page: Page, key: string) =>
  page.evaluate((name) => localStorage.getItem(name), key)

/** Puts values in the browser's storage and reloads, so the app starts with them in place. */
export async function seedStorage(page: Page, entries: Record<string, string>) {
  await page.goto('/')
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value)
  }, entries)
  await page.reload()
}

// ---- the content API (CNT-01), for the page screens ----

export const pageType = {
  id: '0198f2a0-0000-7000-8000-0000000000b1',
  slug: 'page',
  name: 'Page',
  urlPrefix: null,
  hierarchical: true,
  hasCategories: false,
  hasTags: false,
  isBuiltin: true,
}

export const postType = {
  id: '0198f2a0-0000-7000-8000-0000000000b2',
  slug: 'post',
  name: 'Post',
  urlPrefix: '/blog',
  hierarchical: false,
  hasCategories: true,
  hasTags: true,
  isBuiltin: true,
}

/** A content type as `GET /content-types` lists it (api/src/content/content.service.ts). */
export type FakeType = Omit<typeof pageType, 'urlPrefix'> & { urlPrefix: string | null }

export type FakePage = {
  id: string
  type: { id: string; slug: string; name: string }
  parentId: string | null
  title: string
  slug: string
  path: string
  status: string
  publishedAt: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  blocks: unknown[]
  data: Record<string, unknown>
  seoTitle: string | null
  seoDescription: string | null
  canonicalUrl: string | null
  noIndex: boolean
  /** Who created the page, as list rows name them (users-roles); `null` when unknown. */
  author: { id: string; name: string } | null
}

export const typeRef = (type: { id: string; slug: string; name: string }) => ({
  id: type.id,
  slug: type.slug,
  name: type.name,
})

/** A page as the content API answers. `n` keeps ids and dates apart; any field can be given. */
export function fakePage(n: number, fields: Partial<FakePage> = {}): FakePage {
  const slug = fields.slug ?? `page-${n}`
  return {
    id: `0198f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`,
    type: typeRef(pageType),
    parentId: null,
    title: `Page ${n}`,
    slug,
    path: `/${slug}`,
    status: 'draft',
    publishedAt: null,
    createdBy: person.id,
    updatedBy: person.id,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: `2026-10-0${1 + (n % 8)}T10:00:00.000Z`,
    blocks: [],
    data: {},
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    noIndex: false,
    author:
      ('createdBy' in fields ? fields.createdBy : person.id) === person.id
        ? { id: person.id, name: person.name }
        : null,
    ...fields,
  }
}

/** A list row: the real API leaves out the blocks, the custom data and the search fields. */
const DETAIL_ONLY = ['blocks', 'data', 'seoTitle', 'seoDescription', 'canonicalUrl', 'noIndex']
const summaryOf = (page: FakePage) =>
  Object.fromEntries(Object.entries(page).filter(([key]) => !DETAIL_ONLY.includes(key)))

type Handler = (route: Route, request: Request) => boolean | Promise<boolean>

/**
 * A stand-in content API with a list of pages the test can read and change. `calls` records every
 * request, and `override` lets a test answer a request itself (a 403, no connection): return true
 * when it has.
 */
export async function fakeContent(page: Page, initial: FakePage[] = []) {
  const state = {
    pages: [...initial],
    calls: [] as string[],
    /** The body of every PATCH (a save), in order. */
    saved: [] as Record<string, unknown>[],
    /** The site's content types; `POST /content-types` adds one (D-043). */
    types: [pageType, postType] as FakeType[],
    override: null as Handler | null,
  }

  await page.route(
    (url) => url.port === String(flowApiPort) && /^\/content(-types)?(\/|$)/.test(url.pathname),
    async (route, request) => {
      const url = new URL(request.url())
      const method = request.method()
      state.calls.push(`${method} ${url.pathname}${url.search}`)
      if (state.override && (await state.override(route, request))) return

      if (url.pathname === '/content-types' && method === 'GET') {
        return fulfill(route, 200, { items: state.types })
      }
      if (url.pathname === '/content-types' && method === 'POST') {
        const body = request.postDataJSON() as { name: string; urlPrefix: string }
        const slug = body.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
        const same = state.types.find((type) => type.slug === slug)
        if (same) {
          return fulfill(route, 409, {
            statusCode: 409,
            message: `This site already has a content type called ${same.name}`,
          })
        }
        const made: FakeType = {
          id: `0198f2a0-0000-7000-8000-0000000000b${state.types.length + 1}`,
          slug,
          name: body.name,
          urlPrefix: body.urlPrefix,
          hierarchical: false,
          hasCategories: false,
          hasTags: false,
          isBuiltin: false,
        }
        state.types = [...state.types, made]
        return fulfill(route, 201, made)
      }
      if (url.pathname === '/content' && method === 'GET') {
        const type = url.searchParams.get('type')
        const status = url.searchParams.get('status')
        const path = url.searchParams.get('path')
        const limit = Number(url.searchParams.get('limit') ?? 25)
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const matching = state.pages.filter(
          (item) =>
            (!type || item.type.slug === type) &&
            (!status || item.status === status) &&
            (!path || item.path === path),
        )
        return fulfill(route, 200, {
          items: matching.slice(offset, offset + limit).map(summaryOf),
          total: matching.length,
          limit,
          offset,
        })
      }
      if (url.pathname === '/content' && method === 'POST') {
        const body = request.postDataJSON() as {
          type: string
          title: string
          slug: string
          blocks?: unknown[]
        }
        const type = state.types.find((item) => item.slug === body.type)
        if (!type)
          return fulfill(route, 400, { message: 'Invalid request', errors: ['type: unknown'] })
        const created = fakePage(state.pages.length + 100, {
          type: typeRef(type),
          title: body.title,
          slug: body.slug,
          path: `${type.urlPrefix ?? ''}/${body.slug}`,
          blocks: body.blocks ?? [],
        })
        state.pages.unshift(created)
        return fulfill(route, 201, created)
      }
      const action = url.pathname.match(/^\/content\/([^/]+)\/(publish|unpublish)$/)
      if (action && method === 'POST') {
        const found = state.pages.find((item) => item.id === action[1])
        if (!found) return fulfill(route, 404, { message: 'Page not found' })
        if (action[2] === 'unpublish' && found.status !== 'published') {
          return fulfill(route, 409, { message: 'This page is not published' })
        }
        found.status = action[2] === 'publish' ? 'published' : 'draft'
        found.publishedAt = action[2] === 'publish' ? '2026-10-09T10:00:00.000Z' : null
        return fulfill(route, 200, found)
      }
      const one = url.pathname.match(/^\/content\/([^/]+)$/)
      if (one) {
        const found = state.pages.find((item) => item.id === one[1])
        if (!found) return fulfill(route, 404, { message: 'Page not found' })
        if (method === 'GET') return fulfill(route, 200, found)
        if (method === 'PATCH') {
          const body = request.postDataJSON() as Record<string, unknown>
          state.saved.push(body)
          Object.assign(found, body, { updatedAt: '2026-10-09T10:00:00.000Z' })
          return fulfill(route, 200, found)
        }
      }
      return fulfill(route, 404, { message: 'Not found' })
    },
  )
  return state
}

/** What the mock `/auth/me` answers with. A test can change it while the page is open. */
/** A membership as `/auth/me` answers; `ownsOrganization` says the person may delete the site (D-039). */
export type MockMembership = typeof orchard & {
  /** The organization the site belongs to, as the API names it since organizations T1. */
  site: { organizationId?: string }
  ownsOrganization?: boolean
}

/** `organizations` left out is the API before organizations (see `profileBody`). */
export type MockSession = {
  memberships: MockMembership[]
  organizations?: MockOrganization[]
  meFails: boolean
}

/**
 * Opens the app signed in as the mock person, on one site (or, with `sites: false`, on none), with
 * a role that holds exactly these permissions. Returns the session the mock `/auth/me` answers from.
 */
export async function signedInAs(
  page: Page,
  permissions: string[],
  options: { sites?: boolean; role?: string; ownsOrganization?: boolean } = {},
): Promise<MockSession> {
  const membership: MockMembership = {
    ...orchard,
    role: { ...orchard.role, name: options.role ?? 'Tester' },
    permissions,
    ...(options.ownsOrganization === undefined
      ? {}
      : { ownsOrganization: options.ownsOrganization }),
  }
  const session: MockSession = {
    memberships: options.sites === false ? [] : [membership],
    meFails: false,
  }
  await page.route('**/auth/me', (route) =>
    session.meFails
      ? route.abort('connectionrefused')
      : fulfill(route, 200, profileBody(session.memberships, session.organizations)),
  )
  await seedStorage(page, {
    [SESSION_KEY]: JSON.stringify({ accessToken: 'saved-token', expiresAt: inDays(1) }),
  })
  return session
}

/**
 * Opens the app signed in as the mock person with exactly these memberships and organizations (leave
 * `organizations` out for the API before them), and anything already in the browser's storage, such
 * as the organization or site last used. Returns the session the mock `/auth/me` answers from.
 */
export async function signedInWith(
  page: Page,
  options: {
    memberships: MockMembership[]
    organizations?: MockOrganization[]
    storage?: Record<string, string>
  },
): Promise<MockSession> {
  const session: MockSession = {
    memberships: options.memberships,
    organizations: options.organizations,
    meFails: false,
  }
  await page.route('**/auth/me', (route) =>
    session.meFails
      ? route.abort('connectionrefused')
      : fulfill(route, 200, profileBody(session.memberships, session.organizations)),
  )
  await seedStorage(page, {
    [SESSION_KEY]: JSON.stringify({ accessToken: 'saved-token', expiresAt: inDays(1) }),
    ...options.storage,
  })
  return session
}

// ---- creating a site (GOV-08a) ----

export const orchardHoldings = {
  id: '0198f2a0-0000-7000-8000-0000000000c1',
  name: 'Orchard Holdings',
}
export const orchardSecond = {
  id: '0198f2a0-0000-7000-8000-0000000000c2',
  name: 'Orchard Second Ltd',
}

type SiteBody = { name: string; hostnames: string[]; organizationId?: string }

/**
 * A stand-in for the routes that create a site or an organization. A successful `POST /sites` is
 * recorded in `posted` and adds the site to the session, so the next `/auth/me` lists it, as the real
 * API does; a successful `POST /organizations` (organizations T2) is recorded in `createdOrganizations`,
 * added to `organizations` and to the session's. `override` works as in `fakeContent`.
 */
export async function fakeSites(
  page: Page,
  session: MockSession,
  organizations: { id: string; name: string }[],
) {
  const state = {
    posted: [] as SiteBody[],
    /** The names sent to `POST /organizations`, in order, as sent. */
    createdOrganizations: [] as string[],
    /** The ids of the sites deleted, in order (D-039). */
    deleted: [] as string[],
    calls: [] as string[],
    override: null as Handler | null,
  }

  await page.route(
    (url) =>
      url.port === String(flowApiPort) &&
      (url.pathname === '/organizations' || /^\/sites(\/|$)/.test(url.pathname)),
    async (route, request) => {
      const method = request.method()
      state.calls.push(`${method} ${new URL(request.url()).pathname}`)
      if (state.override && (await state.override(route, request))) return

      const deleting = new URL(request.url()).pathname.match(/^\/sites\/([^/]+)$/)
      if (deleting && method === 'DELETE') {
        const at = session.memberships.findIndex((item) => item.site.id === deleting[1])
        if (at === -1) return fulfill(route, 404, { message: 'Site not found' })
        session.memberships.splice(at, 1)
        state.deleted.push(deleting[1])
        return route.fulfill({ status: 204 })
      }
      if (method === 'GET') return fulfill(route, 200, { items: organizations })
      if (method === 'POST' && new URL(request.url()).pathname === '/organizations') {
        const { name } = request.postDataJSON() as { name: string }
        state.createdOrganizations.push(name)
        const organization = {
          id: `0198f2a0-0000-7000-8000-${String(800 + organizations.length).padStart(12, '0')}`,
          name: name.trim(),
        }
        organizations.push(organization)
        session.organizations?.push({ ...organization, ownsOrganization: true })
        session.organizations?.sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        )
        return fulfill(route, 201, organization)
      }
      if (method === 'POST') {
        const body = request.postDataJSON() as SiteBody
        state.posted.push(body)
        const organization =
          organizations.find((item) => item.id === body.organizationId) ?? organizations[0]
        const site = {
          id: `0198f2a0-0000-7000-8000-${String(900 + session.memberships.length).padStart(12, '0')}`,
          name: body.name,
          primaryHost: body.hostnames[0] ?? null,
          theme: {},
          ...(session.organizations ? { organizationId: organization.id } : {}),
        }
        const membership = {
          site,
          role: { ...orchard.role, name: 'Administrator' },
          permissions: [
            'content.create',
            'content.edit_any',
            'content.edit_own',
            'content.publish',
          ],
          ownsOrganization: true,
        }
        session.memberships.push(membership)
        return fulfill(route, 201, {
          organization,
          site,
          hostnames: body.hostnames.map((hostname) => hostname.toLowerCase()),
          membership,
        })
      }
      return fulfill(route, 404, { message: 'Not found' })
    },
  )
  return state
}

/** What the mock `/appearance` holds: a site's name, tagline, footer note and stored theme (GOV-04). */
export type FakeAppearance = {
  name: string
  tagline: string
  footerNote: string
  theme: Record<string, unknown>
}

/**
 * A stand-in for `GET` and `PATCH /appearance`. `saved` records the body of every save, and a save is
 * applied as the API would: what is sent replaces what was there.
 */
export async function fakeAppearance(page: Page, initial: FakeAppearance) {
  const state = { appearance: { ...initial }, saved: [] as Record<string, unknown>[] }
  await page.route(
    (url) => url.port === String(flowApiPort) && url.pathname === '/appearance',
    async (route, request) => {
      if (request.method() === 'GET') return fulfill(route, 200, state.appearance)
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON() as Record<string, unknown>
        state.saved.push(body)
        state.appearance = { ...state.appearance, ...body } as FakeAppearance
        return fulfill(route, 200, state.appearance)
      }
      return fulfill(route, 404, { message: 'Not found' })
    },
  )
  return state
}

/** A real 96 × 64 PNG, small enough to write here: what the stand-in serves for every picture. */
export const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAMAAADS6oI8AAAAA1BMVEXWhD6w8DS8AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHUlEQVRYw+3BMQEAAADCoPVP7W0HoAAAAAAAAN4AGEAAAVgzK50AAAAASUVORK5CYII=',
  'base64',
)

/** One picture as `GET /media` lists it (api/src/media/media.service.ts). */
export type FakeMedia = {
  id: string
  filename: string
  url: string
  thumbUrl: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  createdAt: string
}

/**
 * Where the stand-in's pictures live: a fixed address, not the stand-in API's port, so a screenshot
 * that shows a picture's address is the same in every checkout and slot.
 */
const MEDIA_HOST = 'media.test'
const mediaBase = () => `https://${MEDIA_HOST}/uploads/${orchard.site.id}`

export function fakeMediaItem(n: number, fields: Partial<FakeMedia> = {}): FakeMedia {
  const id = `0198f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`
  return {
    id,
    filename: `picture-${n}.png`,
    url: `${mediaBase()}/${id}.png`,
    thumbUrl: `${mediaBase()}/${id}-thumb.webp`,
    mimeType: 'image/png',
    sizeBytes: 245_000,
    width: 1600,
    height: 1067,
    createdAt: new Date(Date.UTC(2026, 9, 1, 9, 0, n)).toISOString(),
    ...fields,
  }
}

/**
 * A stand-in for the media library: `GET /media` (paged, newest first), `POST /media` (the file's
 * name is read from the form; `uploads` records each), and every picture at `https://media.test/uploads/…`
 * answered with `SAMPLE_PNG`. `override` can answer a call itself first.
 */
export async function fakeMedia(page: Page, initial: FakeMedia[] = []) {
  const state = {
    items: [...initial],
    uploads: [] as string[],
    override: null as ((route: Route, request: Request) => boolean) | null,
  }
  let next = 1000
  await page.route(
    (url) => url.hostname === MEDIA_HOST && url.pathname.startsWith('/uploads/'),
    (route) => route.fulfill({ status: 200, contentType: 'image/png', body: SAMPLE_PNG }),
  )
  await page.route(
    (url) => url.port === String(flowApiPort) && url.pathname === '/media',
    async (route, request) => {
      if (state.override?.(route, request)) return
      if (request.method() === 'GET') {
        const query = new URL(request.url()).searchParams
        const limit = Number(query.get('limit') ?? 40)
        const offset = Number(query.get('offset') ?? 0)
        return fulfill(route, 200, {
          items: state.items.slice(offset, offset + limit),
          total: state.items.length,
        })
      }
      if (request.method() === 'POST') {
        const form = request.postDataBuffer()?.toString('latin1') ?? ''
        const filename = /filename="([^"]*)"/.exec(form)?.[1] ?? 'picture'
        state.uploads.push(filename)
        next += 1
        const item = fakeMediaItem(next, { filename, sizeBytes: 1234 })
        state.items = [item, ...state.items]
        return fulfill(route, 201, item)
      }
      return fulfill(route, 404, { message: 'Not found' })
    },
  )
  return state
}

// ---- the people of a site and their invitations (users-roles T5), for the Users screen ----

/** The five roles every site has, in the order the API lists them (`ROLE_DEFINITIONS`). */
export const siteRoles = {
  Administrator: orchard.role,
  Editor: { id: '0198f2a0-0000-7000-8000-0000000000d2', name: 'Editor' },
  Author: { id: '0198f2a0-0000-7000-8000-0000000000d3', name: 'Author' },
  Contributor: { id: '0198f2a0-0000-7000-8000-0000000000d4', name: 'Contributor' },
  Viewer: { id: '0198f2a0-0000-7000-8000-0000000000d5', name: 'Viewer' },
}

export type RoleName = keyof typeof siteRoles

/** One person as `GET /members` lists them (api/src/members/site-member.repository.ts). */
export type FakeMember = {
  userId: string
  name: string
  email: string
  role: { id: string; name: string }
  isOwner: boolean
}

/** One invitation as `GET /members` lists it (api/src/invitations/invitation.repository.ts). */
export type FakeInvitation = {
  id: string
  email: string
  role: { id: string; name: string }
  expiresAt: string
  expired: boolean
  invitedBy: { id: string; name: string } | null
  createdAt: string
}

/** A person on the site. `n` keeps ids apart; the email comes from the name unless given. */
export function fakeMember(
  n: number,
  name: string,
  role: RoleName,
  fields: Partial<FakeMember> = {},
): FakeMember {
  return {
    userId: `0198f2a0-0000-7000-8000-${String(2000 + n).padStart(12, '0')}`,
    name,
    email: `${name.toLowerCase()}@orchard.test`,
    role: siteRoles[role],
    isOwner: false,
    ...fields,
  }
}

/** A waiting invitation. `expiresAt` decides `expired`, as in the API's answer. */
export function fakeInvitation(
  n: number,
  email: string,
  role: RoleName,
  expiresAt: string = inDays(7),
): FakeInvitation {
  return {
    id: `0198f2a0-0000-7000-8000-${String(3000 + n).padStart(12, '0')}`,
    email,
    role: siteRoles[role],
    expiresAt,
    expired: Date.parse(expiresAt) <= Date.now(),
    invitedBy: { id: person.id, name: person.name },
    createdAt: new Date(Date.UTC(2026, 9, 1, 9, 0, n)).toISOString(),
  }
}

/** Who may not lose `members.manage`, checked in the API's order (api/src/members/site-member.repository.ts). */
function safetyRefusal(members: FakeMember[], member: FakeMember, keepsManage: boolean) {
  if (keepsManage || member.role.id !== siteRoles.Administrator.id) return null
  if (member.isOwner) return "The organisation's owner stays an Administrator."
  const managers = members.filter((item) => item.role.id === siteRoles.Administrator.id)
  return managers.length === 1 ? 'A site needs at least one Administrator.' : null
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * A stand-in for the Administrator's routes on people and invitations, with the rules the real ones
 * apply: `GET /members`, `PATCH` and `DELETE /members/:userId`, `POST /invitations`,
 * `POST /invitations/:id/renew` and `DELETE /invitations/:id`, each needing `members.manage` on the
 * site in `X-Site-Id`. Changing or removing the signed-in person changes the session too, so the next
 * `/auth/me` follows, as the real API's does.
 *
 * `calls` records every request, `tokens` every link secret answered (the API shows each once),
 * `override` works as in `fakeContent`, and `hold()` keeps changes waiting until the function it
 * returns is called, to see the screen while a request runs.
 */
export async function fakeMembers(
  page: Page,
  session: MockSession,
  initial: { members: FakeMember[]; invitations?: FakeInvitation[] },
) {
  let held: Promise<void> | null = null
  let made = 0
  const state = {
    members: initial.members.map((member) => ({ ...member })),
    invitations: (initial.invitations ?? []).map((invitation) => ({ ...invitation })),
    calls: [] as string[],
    tokens: [] as string[],
    override: null as Handler | null,
    hold() {
      // One hold at a time: a second would lose the first's release, and the test would hang.
      if (held) throw new Error('hold() is already holding: call its release function first')
      let release = () => {}
      held = new Promise<void>((resolve) => {
        release = resolve
      })
      return () => {
        held = null
        release()
      }
    },
  }

  const issued = (invitation: FakeInvitation) => {
    const token = randomBytes(32).toString('base64url')
    state.tokens.push(token)
    return { invitation, token }
  }

  await page.route(
    (url) =>
      url.port === String(flowApiPort) && /^\/(members|invitations)(\/|$)/.test(url.pathname),
    async (route, request) => {
      const { pathname } = new URL(request.url())
      const method = request.method()
      state.calls.push(`${method} ${pathname}`)
      if (state.override && (await state.override(route, request))) return
      if (method !== 'GET' && held) await held

      const siteId = request.headers()['x-site-id']
      if (!siteId) {
        return fulfill(route, 400, {
          statusCode: 400,
          message: 'X-Site-Id must be the id of one site (a uuid)',
        })
      }
      const membership = session.memberships.find((item) => item.site.id === siteId)
      if (!membership?.permissions.includes('members.manage')) {
        return fulfill(route, 403, { statusCode: 403, message: 'Forbidden' })
      }

      if (pathname === '/members' && method === 'GET') {
        return fulfill(route, 200, {
          roles: Object.values(siteRoles),
          members: [...state.members].sort(
            (a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId),
          ),
          invitations: [...state.invitations].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          ),
        })
      }

      const oneMember = pathname.match(/^\/members\/([^/]+)$/)
      if (oneMember && (method === 'PATCH' || method === 'DELETE')) {
        const member = state.members.find((item) => item.userId === oneMember[1])
        if (!member) {
          return fulfill(route, 404, { statusCode: 404, message: 'Not a member of this site' })
        }
        if (method === 'DELETE') {
          const refusal = safetyRefusal(state.members, member, false)
          if (refusal) return fulfill(route, 409, { statusCode: 409, message: refusal })
          state.members = state.members.filter((item) => item !== member)
          if (member.userId === person.id) {
            session.memberships = session.memberships.filter((item) => item !== membership)
          }
          return route.fulfill({ status: 204 })
        }

        const { roleId } = request.postDataJSON() as { roleId: string }
        const role = Object.values(siteRoles).find((item) => item.id === roleId)
        if (!role) {
          return fulfill(route, 400, {
            statusCode: 400,
            message: "That role is not one of this site's roles.",
          })
        }
        if (role.id !== member.role.id) {
          const keepsManage = role.id === siteRoles.Administrator.id
          const refusal = safetyRefusal(state.members, member, keepsManage)
          if (refusal) return fulfill(route, 409, { statusCode: 409, message: refusal })
          member.role = role
          if (member.userId === person.id) {
            membership.role = role
            if (!keepsManage) {
              membership.permissions = membership.permissions.filter(
                (permission) => permission !== 'members.manage',
              )
            }
          }
        }
        return fulfill(route, 200, member)
      }

      if (pathname === '/invitations' && method === 'POST') {
        const body = request.postDataJSON() as { email?: unknown; roleId?: unknown }
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (!EMAIL.test(email) || email.length > 254) {
          return fulfill(route, 400, {
            message: 'Invalid request',
            errors: ['email: Invalid email address'],
          })
        }
        const role = Object.values(siteRoles).find((item) => item.id === body.roleId)
        if (!role) {
          return fulfill(route, 400, {
            message: 'Invalid request',
            errors: ["roleId: That role is not one of this site's roles."],
          })
        }
        if (state.members.some((member) => member.email === email)) {
          return fulfill(route, 409, {
            statusCode: 409,
            message: `${email} is already a member of this site.`,
          })
        }
        // A waiting invite for the same email is replaced: a new row, link, role and expiry.
        made += 1
        const invitation: FakeInvitation = {
          ...fakeInvitation(100 + made, email, 'Viewer'),
          role,
          createdAt: new Date().toISOString(),
        }
        state.invitations = [
          invitation,
          ...state.invitations.filter((item) => item.email !== email),
        ]
        return fulfill(route, 201, issued(invitation))
      }

      const renewing = pathname.match(/^\/invitations\/([^/]+)\/renew$/)
      if (renewing && method === 'POST') {
        const invitation = state.invitations.find((item) => item.id === renewing[1])
        if (!invitation) {
          return fulfill(route, 404, { statusCode: 404, message: 'Invitation not found' })
        }
        invitation.expiresAt = inDays(7)
        invitation.expired = false
        return fulfill(route, 200, issued(invitation))
      }

      const oneInvitation = pathname.match(/^\/invitations\/([^/]+)$/)
      if (oneInvitation && method === 'DELETE') {
        const invitation = state.invitations.find((item) => item.id === oneInvitation[1])
        if (!invitation) {
          return fulfill(route, 404, { statusCode: 404, message: 'Invitation not found' })
        }
        state.invitations = state.invitations.filter((item) => item !== invitation)
        return route.fulfill({ status: 204 })
      }

      return fulfill(route, 404, { message: 'Not found' })
    },
  )
  return state
}

// ---- the page an invite link opens (users-roles T7) ----

/** A link as the stand-in knows it: `token` is the secret after the `#` of `/invite#<token>`. */
export type FakeInvite = {
  token: string
  siteName: string
  /**
   * The site's id and its organization, as the lookup answers them since organizations T1. Left out, the
   * lookup answers as the API did before (no ids), and the joined site gets the stand-in's one id.
   */
  siteId?: string
  organization?: { id: string; name: string }
  roleName: RoleName
  email: string
  hasAccount: boolean
  /** Sites an existing account already belongs to; they come before the new one in its answer. */
  alsoMemberOf?: MockMembership[]
}

/** What each role holds, in short (the real lists are `ROLE_DEFINITIONS` in api/src/auth/roles.ts). */
const permissionsOf: Record<RoleName, string[]> = {
  Administrator: ['content.create', 'content.edit_any', 'content.edit_own', 'members.manage'],
  Editor: ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish'],
  Author: ['content.create', 'content.edit_own', 'content.publish_own', 'media.upload'],
  Contributor: ['content.create', 'content.edit_own'],
  Viewer: [],
}

/**
 * A stand-in for the two open routes behind the invite page, with the real ones' rules
 * (api/src/invitations/): `POST /invitations/lookup` says what a link is for and `POST
 * /invitations/accept` joins. A new email needs a name and a password of at least 12 characters (else
 * a 400 that names the field); an existing account needs its password: a wrong one is a 401, or a 409
 * when a name came with it (the account appeared after the page opened). A link it does not know is
 * the one 404 every dead link gets, which an invite is once it has been accepted (the real API uses it
 * up). While `paused` is set, an existing account's accept is the sign-in limit's 429. `calls` records
 * each request's body and `joined` the emails that got in.
 *
 * A link of several websites is several invites for one email (organizations T8): an account made by
 * the first accept is the account of the others, which then want its password and no name, and each
 * accept answers with every website that email has joined so far.
 */
export async function fakeInvites(
  page: Page,
  invites: FakeInvite[],
  options: { accountPassword?: string } = {},
) {
  const accountPassword = options.accountPassword ?? 'orchard-flow-password'
  const state = {
    invites: invites.map((invite) => ({ ...invite })),
    calls: [] as { path: string; body: Record<string, unknown> }[],
    joined: [] as string[],
    paused: false,
    /** What each email has joined through this stand-in, in order. */
    sites: new Map<
      string,
      { membership: MockMembership; organization?: FakeInvite['organization'] }[]
    >(),
    /** The accounts made here, by email: their later accepts send the password and are answered with the name. */
    accounts: new Map<string, { password: string; name: string }>(),
  }

  await page.route(
    (url) =>
      url.port === String(flowApiPort) && /^\/invitations\/(lookup|accept)$/.test(url.pathname),
    (route, request) => {
      const { pathname } = new URL(request.url())
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
      state.calls.push({ path: pathname, body })

      const invite = state.invites.find((item) => item.token === body.token)
      if (!invite) {
        return fulfill(route, 404, {
          statusCode: 404,
          message: 'This invite is no longer valid. Ask for a new one.',
        })
      }
      if (pathname === '/invitations/lookup') {
        return fulfill(route, 200, {
          site: {
            ...(invite.siteId === undefined ? {} : { id: invite.siteId }),
            name: invite.siteName,
          },
          ...(invite.organization === undefined ? {} : { organization: invite.organization }),
          role: { name: invite.roleName },
          email: invite.email,
          hasAccount: invite.hasAccount,
          expiresAt: inDays(7),
        })
      }

      const password = typeof body.password === 'string' ? body.password : ''
      const made = state.accounts.get(invite.email)
      let name = made?.name ?? person.name
      if (invite.hasAccount) {
        if (state.paused) {
          return fulfill(route, 429, {
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'Too many sign-in attempts. Try again in 15 minutes.',
          })
        }
        if (password !== (made?.password ?? accountPassword)) {
          return body.name === undefined
            ? fulfill(route, 401, { statusCode: 401, message: 'Invalid email or password' })
            : fulfill(route, 409, {
                statusCode: 409,
                message: 'This email already has an account. Sign in to join.',
              })
        }
      } else {
        const typed = typeof body.name === 'string' ? body.name.trim() : ''
        const errors = [
          ...(typed === '' || typed.length > 100
            ? ['name: Enter a name of 1 to 100 characters']
            : []),
          ...(password.length < 12 ? ['password: Use at least 12 characters'] : []),
        ]
        if (errors.length > 0) return fulfill(route, 400, { message: 'Invalid request', errors })
        name = typed
      }

      state.joined.push(invite.email)
      const joined: MockMembership = {
        site: {
          ...orchard.site,
          id: invite.siteId ?? '0198f2a0-0000-7000-8000-0000000000c1',
          name: invite.siteName,
          ...(invite.organization === undefined ? {} : { organizationId: invite.organization.id }),
        },
        role: siteRoles[invite.roleName],
        permissions: permissionsOf[invite.roleName],
        ownsOrganization: false,
      }
      const sofar = [
        ...(state.sites.get(invite.email) ?? []),
        { membership: joined, organization: invite.organization },
      ]
      state.sites.set(invite.email, sofar)

      // The invite is used up; an account made now is the account of the same email's other invites.
      state.invites.splice(state.invites.indexOf(invite), 1)
      if (!invite.hasAccount) {
        state.accounts.set(invite.email, { password, name })
        for (const other of state.invites) if (other.email === invite.email) other.hasAccount = true
      }

      const organizations = [
        ...new Map(
          sofar.flatMap(({ organization }) =>
            organization ? [[organization.id, organization]] : [],
          ),
        ).values(),
      ].map((organization) => ({ ...organization, ownsOrganization: false }))
      return fulfill(route, 200, {
        accessToken: `invited-${invite.token}`,
        tokenType: 'Bearer',
        expiresAt: inDays(7),
        user: { id: '0198f2a0-0000-7000-8000-0000000000e1', email: invite.email, name },
        memberships: [...(invite.alsoMemberOf ?? []), ...sofar.map(({ membership }) => membership)],
        ...(organizations.length > 0 ? { organizations } : {}),
      })
    },
  )
  return state
}

// ---- the company team (organizations T3, T7) ----

export type FakeTeam = {
  organization: { id: string; name: string }
  websites: { id: string; name: string; roles: { id: string; name: string }[] }[]
  people: {
    userId: string
    name: string
    email: string
    isOwner: boolean
    access: { siteId: string; role: { id: string; name: string } }[]
  }[]
  invitations: {
    id: string
    email: string
    siteId: string
    role: { id: string; name: string }
    expiresAt: string
    expired: boolean
  }[]
}

/**
 * A stand-in for `GET /organizations/:id/team` and for `POST /invitations` on any of the organization's
 * websites (the site is the `X-Site-Id` header). `posted` records each invitation asked for, in order;
 * a successful one is added to the team's waiting invitations (replacing a waiting one for the same
 * website and email) and answered with a link secret `secret-N`. `override` works as in `fakeContent`.
 */
export async function fakeTeam(page: Page, initial: FakeTeam) {
  const state = {
    team: initial,
    calls: [] as string[],
    posted: [] as { siteId: string; email: string; roleId: string }[],
    /** When the invitations it makes expire (an ISO time); 7 days from now when left out. */
    expiresAt: null as string | null,
    override: null as Handler | null,
  }

  await page.route(
    (url) =>
      url.port === String(flowApiPort) &&
      (/^\/organizations\/[^/]+\/team$/.test(url.pathname) || url.pathname === '/invitations'),
    async (route, request) => {
      const { pathname } = new URL(request.url())
      state.calls.push(`${request.method()} ${pathname}`)
      if (state.override && (await state.override(route, request))) return

      if (request.method() === 'GET') return fulfill(route, 200, state.team)

      const siteId = request.headers()['x-site-id'] ?? ''
      const { email, roleId } = request.postDataJSON() as { email: string; roleId: string }
      state.posted.push({ siteId, email, roleId })
      const role = state.team.websites
        .find((website) => website.id === siteId)
        ?.roles.find((one) => one.id === roleId)
      if (!role)
        return fulfill(route, 400, { message: 'That role is not one of this site’s roles.' })
      const invitation = {
        id: `0198f2a0-0000-7000-8000-${String(700 + state.posted.length).padStart(12, '0')}`,
        email,
        siteId,
        role,
        expiresAt: state.expiresAt ?? inDays(7),
        expired: false,
      }
      state.team.invitations = [
        ...state.team.invitations.filter(
          (waiting) => !(waiting.siteId === siteId && waiting.email === email),
        ),
        invitation,
      ]
      return fulfill(route, 201, {
        invitation: { ...invitation, invitedBy: null, createdAt: new Date().toISOString() },
        token: `secret-${state.posted.length}`,
      })
    },
  )
  return state
}
