import { useSyncExternalStore } from 'react'
import { ApiError, NetworkError, isLoginResult, isProfile, isRecord, request } from './api.ts'
import type { LoginResult, Membership, OrganizationSummary, Profile, User } from './api.ts'

/**
 * Who is signed in, kept outside React so every screen and every API call sees the same answer.
 *
 * Only the token and its expiry are stored (`cms-admin.session`). The person, their sites and
 * their role are asked of the API on every load, so a removed member or a changed role shows up
 * at once. The site being worked on is remembered in `cms-admin.site`, and its organization in
 * `cms-admin.org` (organizations T6).
 */

export const SESSION_KEY = 'cms-admin.session'
export const SITE_KEY = 'cms-admin.site'
export const ORGANIZATION_KEY = 'cms-admin.org'
export const ENDED_NOTICE = 'Your session has ended. Sign in again.'

export type SessionState =
  | { status: 'checking' }
  | { status: 'signed-out'; notice: string | null }
  | { status: 'cannot-check' }
  | SignedIn

type SignedIn = {
  status: 'signed-in'
  user: User
  memberships: Membership[]
  /** The organizations the person owns or has a site in; null from an API that predates them. */
  organizations: OrganizationSummary[] | null
  /** The organization being worked in; null with an older API, or when the person has none. */
  organizationId: string | null
  /** The site being worked on: with organizations, always one of the organization's, or null when it has none. */
  siteId: string | null
}

/** `paused` is the sign-in limit (users-roles T4): the API's own sentence says for how long. */
export type SignInOutcome =
  | { outcome: 'ok' | 'invalid' | 'unreachable' | 'failed' }
  | { outcome: 'paused'; message: string }

let state: SessionState = { status: 'checking' }
let token: string | null = null
/** Bumped whenever the session changes under a check that is still running, so its answer is dropped. */
let generation = 0
const listeners = new Set<() => void>()

function setState(next: SessionState): void {
  state = next
  listeners.forEach((listener) => listener())
}

// Storage can be missing or refuse writes (private windows, blocked site data): the session then
// simply lasts until the tab closes.
function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // see above
  }
}

function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // see above
  }
}

/** The stored token and expiry, or null. A value that is not exactly that shape is removed. */
function readStoredSession(): { accessToken: string; expiresAt: string } | null {
  const raw = storageGet(SESSION_KEY)
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null) {
      const { accessToken, expiresAt } = value as Record<string, unknown>
      if (
        typeof accessToken === 'string' &&
        accessToken !== '' &&
        typeof expiresAt === 'string' &&
        !Number.isNaN(Date.parse(expiresAt))
      ) {
        return { accessToken, expiresAt }
      }
    }
  } catch {
    // not JSON: treated like any other broken value
  }
  storageRemove(SESSION_KEY)
  return null
}

/** The remembered site if the person still belongs to it, otherwise their first one. */
function pickSite(memberships: Membership[]): string | null {
  const remembered = storageGet(SITE_KEY)
  const chosen =
    memberships.find((membership) => membership.site.id === remembered)?.site.id ??
    memberships[0]?.site.id ??
    null
  if (chosen === null) storageRemove(SITE_KEY)
  else if (chosen !== remembered) storageSet(SITE_KEY, chosen)
  return chosen
}

/**
 * The organization and site to work in. With organizations: the remembered organization if the person
 * is still in it, else the one of the remembered site, else the first; then the remembered site if it is
 * in that organization, else its first, or none. Without them (an API that predates them): `pickSite`
 * as it was.
 */
function pickWorkspace(
  memberships: Membership[],
  organizations: OrganizationSummary[] | null,
): { organizationId: string | null; siteId: string | null } {
  if (organizations === null) {
    storageRemove(ORGANIZATION_KEY)
    return { organizationId: null, siteId: pickSite(memberships) }
  }
  const remembered = storageGet(ORGANIZATION_KEY)
  const ofRememberedSite = memberships.find(
    (membership) => membership.site.id === storageGet(SITE_KEY),
  )?.site.organizationId
  const organizationId =
    [remembered, ofRememberedSite].find((candidate) =>
      organizations.some((organization) => organization.id === candidate),
    ) ??
    organizations[0]?.id ??
    null
  if (organizationId === null) storageRemove(ORGANIZATION_KEY)
  else if (organizationId !== remembered) storageSet(ORGANIZATION_KEY, organizationId)
  const siteId = pickSite(
    memberships.filter((membership) => membership.site.organizationId === organizationId),
  )
  return { organizationId, siteId }
}

/** The signed-in state for a profile just answered by the API. */
function signedInState(profile: Profile): SignedIn {
  const organizations = profile.organizations ?? null
  return {
    status: 'signed-in',
    user: profile.user,
    memberships: profile.memberships,
    organizations,
    ...pickWorkspace(profile.memberships, organizations),
  }
}

function endSession(notice: string | null): void {
  token = null
  storageRemove(SESSION_KEY)
  storageRemove(SITE_KEY)
  storageRemove(ORGANIZATION_KEY)
  setState({ status: 'signed-out', notice })
}

/**
 * Calls the API as the signed-in person: the token and the chosen site go with the request, and a
 * 401 ends the session. Every screen that needs the API goes through here. `siteId` is for the one
 * call about another site than the one being worked on (the company team makes an invitation for each
 * website it names, organizations T7).
 */
export async function authed(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
    siteId?: string
  } = {},
): Promise<unknown> {
  const { siteId: forSite, ...rest } = options
  const siteId = forSite ?? (state.status === 'signed-in' ? state.siteId : storageGet(SITE_KEY))
  try {
    return await request(path, { ...rest, token, siteId })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) endSession(ENDED_NOTICE)
    throw error
  }
}

/** Looks at what is stored and asks the API who it belongs to. Used at start-up, on retry and when another tab signs in or out. */
async function start(): Promise<void> {
  generation += 1
  const mine = generation

  const stored = readStoredSession()
  if (stored === null) {
    token = null
    setState({ status: 'signed-out', notice: null })
    return
  }
  if (Date.parse(stored.expiresAt) <= Date.now()) {
    endSession(ENDED_NOTICE)
    return
  }

  token = stored.accessToken
  setState({ status: 'checking' })
  try {
    const profile = await authed('/auth/me')
    if (mine !== generation) return
    if (!isProfile(profile)) {
      setState({ status: 'cannot-check' })
      return
    }
    setState(signedInState(profile))
  } catch (error) {
    if (mine !== generation) return
    // A 401 already ended the session inside `authed`. Anything else is not the person's fault, so
    // the saved session stays and they can try again.
    if (!(error instanceof ApiError && error.status === 401)) {
      setState({ status: 'cannot-check' })
    }
  }
}

/**
 * Makes the person a sign-in has just answered for the signed-in one, replacing whoever was. `joined`
 * names the site an invite was for, so they land on it and not on the site last worked on in this
 * browser (which may have been someone else's): by its id when the invite lookup gave one, else, for an
 * API that predates it, by name and role (organizations T1, B-45).
 */
export function startSession(
  result: LoginResult,
  joined?: { siteId?: string; siteName: string; roleName: string },
): void {
  generation += 1
  token = result.accessToken
  storageSet(
    SESSION_KEY,
    JSON.stringify({ accessToken: result.accessToken, expiresAt: result.expiresAt }),
  )
  const landing =
    joined &&
    result.memberships.find((membership) =>
      joined.siteId !== undefined
        ? membership.site.id === joined.siteId
        : membership.site.name === joined.siteName && membership.role.name === joined.roleName,
    )
  if (landing) {
    storageSet(SITE_KEY, landing.site.id)
    // Their organization too, or they would land where this browser last was.
    if (result.organizations !== undefined && landing.site.organizationId) {
      storageSet(ORGANIZATION_KEY, landing.site.organizationId)
    }
  }
  setState(signedInState(result))
}

export async function signIn(email: string, password: string): Promise<SignInOutcome> {
  try {
    const result = await request('/auth/login', { method: 'POST', body: { email, password } })
    if (!isLoginResult(result)) return { outcome: 'failed' }
    startSession(result)
    return { outcome: 'ok' }
  } catch (error) {
    if (error instanceof NetworkError) return { outcome: 'unreachable' }
    if (error instanceof ApiError && error.status === 401) return { outcome: 'invalid' }
    if (error instanceof ApiError && error.status === 429) {
      const message =
        isRecord(error.body) && typeof error.body.message === 'string'
          ? error.body.message
          : 'Too many sign-in attempts. Try again later.'
      return { outcome: 'paused', message }
    }
    return { outcome: 'failed' }
  }
}

/** Forgets the session in this browser. The token itself stays valid on the server until it expires (docs/DECISIONS.md D-018). */
export function signOut(): void {
  generation += 1
  endSession(null)
}

/**
 * Asks the API again who the person is and which sites they belong to, without leaving the
 * signed-in frame. Used after they gain a site or an organization, so the switchers know it;
 * `selectSiteId` moves them onto that site (and its organization), `selectOrganizationId` onto that
 * organization (a new one has no site yet), in the same update. Failures are the caller's to explain.
 */
export async function reloadProfile(
  selectSiteId?: string,
  selectOrganizationId?: string,
): Promise<void> {
  if (state.status !== 'signed-in') return
  const mine = generation
  const profile = await authed('/auth/me')
  // The person signed out, or the session was checked again, while this was asking.
  if (mine !== generation || state.status !== 'signed-in') return
  if (!isProfile(profile)) throw new ApiError(502)

  const chosen = profile.memberships.find((membership) => membership.site.id === selectSiteId)
  if (chosen) {
    storageSet(SITE_KEY, chosen.site.id)
    if (profile.organizations !== undefined && chosen.site.organizationId) {
      storageSet(ORGANIZATION_KEY, chosen.site.organizationId)
    }
  }
  const opened = profile.organizations?.find(
    (organization) => organization.id === selectOrganizationId,
  )
  if (opened) storageSet(ORGANIZATION_KEY, opened.id)
  setState(signedInState(profile))
}

/** Works on another site; with organizations, that site's organization becomes the one being worked in. */
export function selectSite(siteId: string): void {
  if (state.status !== 'signed-in') return
  const membership = state.memberships.find((one) => one.site.id === siteId)
  if (!membership) return
  const organizationId =
    state.organizations === null ? null : (membership.site.organizationId ?? state.organizationId)
  storageSet(SITE_KEY, siteId)
  if (organizationId !== null) storageSet(ORGANIZATION_KEY, organizationId)
  setState({ ...state, siteId, organizationId })
}

/**
 * Works in another organization, on its first site, or on none when it has none (organizations T6).
 * Which site was last used in it is not remembered: the sites are few, and they are listed by name.
 */
export function selectOrganization(organizationId: string): void {
  if (state.status !== 'signed-in' || state.organizations === null) return
  if (!state.organizations.some((organization) => organization.id === organizationId)) return
  const first = state.memberships.find(
    (membership) => membership.site.organizationId === organizationId,
  )
  storageSet(ORGANIZATION_KEY, organizationId)
  if (first) storageSet(SITE_KEY, first.site.id)
  else storageRemove(SITE_KEY)
  setState({ ...state, organizationId, siteId: first?.site.id ?? null })
}

export function retry(): void {
  void start()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state)
}

// Another tab signed in or out: follow it. (A tab does not hear about its own changes.)
window.addEventListener('storage', (event) => {
  if (event.key === SESSION_KEY || event.key === null) void start()
})

void start()
