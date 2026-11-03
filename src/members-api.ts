import { ApiError, NetworkError, isRecord } from './api.ts'
import { authed } from './session.ts'

/**
 * The site's people and waiting invites, as the admin uses them (api/src/members/ and
 * api/src/invitations/, users-roles). Each answer is checked for the fields the screen reads;
 * anything else is treated as a failure.
 */

export type Role = { id: string; name: string }

export type Member = {
  userId: string
  name: string
  email: string
  role: Role
  isOwner: boolean
}

export type Invitation = {
  id: string
  email: string
  role: Role
  expiresAt: string
  /** Stays in the list until it is cancelled or given a new link. */
  expired: boolean
}

export type Team = { roles: Role[]; members: Member[]; invitations: Invitation[] }

/** A made or renewed invite with its link's secret: the only time the API ever gives it. */
export type IssuedInvitation = { invitation: Invitation; token: string }

const unusable = () => new ApiError(502)

function isRole(value: unknown): value is Role {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
}

function isMember(value: unknown): value is Member {
  return (
    isRecord(value) &&
    typeof value.userId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    isRole(value.role) &&
    typeof value.isOwner === 'boolean'
  )
}

function isInvitation(value: unknown): value is Invitation {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    isRole(value.role) &&
    typeof value.expiresAt === 'string' &&
    typeof value.expired === 'boolean'
  )
}

function isIssued(value: unknown): value is IssuedInvitation {
  return isRecord(value) && typeof value.token === 'string' && isInvitation(value.invitation)
}

/** Everyone at once (a client team is a handful of people), with the site's roles to choose from. */
export async function fetchTeam(): Promise<Team> {
  const answer = await authed('/members')
  if (
    !isRecord(answer) ||
    !Array.isArray(answer.roles) ||
    !answer.roles.every(isRole) ||
    !Array.isArray(answer.members) ||
    !answer.members.every(isMember) ||
    !Array.isArray(answer.invitations) ||
    !answer.invitations.every(isInvitation)
  ) {
    throw unusable()
  }
  return { roles: answer.roles, members: answer.members, invitations: answer.invitations }
}

export async function changeRole(userId: string, roleId: string): Promise<Member> {
  const answer = await authed(`/members/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { roleId },
  })
  if (!isMember(answer)) throw unusable()
  return answer
}

/** Their pages stay, still credited to them. The API answers 204. */
export async function removeMember(userId: string): Promise<void> {
  await authed(`/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export async function createInvitation(body: {
  email: string
  roleId: string
}): Promise<IssuedInvitation> {
  const answer = await authed('/invitations', { method: 'POST', body })
  if (!isIssued(answer)) throw unusable()
  return answer
}

/** A new link and a new 7 days; the old link stops working. */
export async function renewInvitation(id: string): Promise<IssuedInvitation> {
  const answer = await authed(`/invitations/${encodeURIComponent(id)}/renew`, { method: 'POST' })
  if (!isIssued(answer)) throw unusable()
  return answer
}

export async function cancelInvitation(id: string): Promise<void> {
  await authed(`/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** The secret goes after `#`, so it reaches no server's log (users-roles plan D4). */
export const inviteLink = (token: string): string => `${location.origin}/invite#${token}`

/** The sentence the API gave with a refusal, if it gave one. */
export function apiMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.body)) return null
  return typeof error.body.message === 'string' ? error.body.message : null
}

/** What to say when a change to the list failed: the API's refusals are said as it says them. */
export function refusal(error: unknown): string {
  if (error instanceof NetworkError) {
    return "Can't reach the server. Check your connection and try again."
  }
  if (error instanceof ApiError) {
    if (error.status === 403) return "You don't have permission to do that."
    if (error.status === 400 || error.status === 409) {
      const message = apiMessage(error)
      if (message) return message
    }
  }
  return 'Something went wrong. Try again.'
}
