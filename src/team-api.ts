import { ApiError, isRecord } from './api.ts'
import type { Role } from './members-api.ts'
import { authed } from './session.ts'

/**
 * The company team, as the admin uses it (api/src/organizations/organization-team.service.ts,
 * organizations T3, D-054). Nothing is stored for it: the API reads it from each website's own
 * people. The answer is checked for the fields the screens read; anything else is a failure.
 */

export type TeamWebsite = { id: string; name: string; roles: Role[] }

export type TeamPerson = {
  userId: string
  name: string
  email: string
  isOwner: boolean
  access: { siteId: string; role: Role }[]
}

export type TeamInvitation = {
  id: string
  email: string
  siteId: string
  role: Role
  /** ISO 8601 */
  expiresAt: string
  /** Stays in the list until it is cancelled or given a new link. */
  expired: boolean
}

export type OrganizationTeam = {
  organization: { id: string; name: string }
  websites: TeamWebsite[]
  people: TeamPerson[]
  invitations: TeamInvitation[]
}

const unusable = () => new ApiError(502)

const isText = (value: unknown): value is string => typeof value === 'string'

function isRole(value: unknown): value is Role {
  return isRecord(value) && isText(value.id) && isText(value.name)
}

function isWebsite(value: unknown): value is TeamWebsite {
  return (
    isRecord(value) &&
    isText(value.id) &&
    isText(value.name) &&
    Array.isArray(value.roles) &&
    value.roles.every(isRole)
  )
}

function isPerson(value: unknown): value is TeamPerson {
  return (
    isRecord(value) &&
    isText(value.userId) &&
    isText(value.name) &&
    isText(value.email) &&
    typeof value.isOwner === 'boolean' &&
    Array.isArray(value.access) &&
    value.access.every((entry) => isRecord(entry) && isText(entry.siteId) && isRole(entry.role))
  )
}

function isInvitation(value: unknown): value is TeamInvitation {
  return (
    isRecord(value) &&
    isText(value.id) &&
    isText(value.email) &&
    isText(value.siteId) &&
    isRole(value.role) &&
    isText(value.expiresAt) &&
    typeof value.expired === 'boolean'
  )
}

/** Everyone at once (a company team is a handful of people), as only the organization's owner may ask. */
export async function fetchOrganizationTeam(organizationId: string): Promise<OrganizationTeam> {
  const answer = await authed(`/organizations/${encodeURIComponent(organizationId)}/team`)
  if (
    !isRecord(answer) ||
    !isRecord(answer.organization) ||
    !isText(answer.organization.id) ||
    !isText(answer.organization.name) ||
    !Array.isArray(answer.websites) ||
    !answer.websites.every(isWebsite) ||
    !Array.isArray(answer.people) ||
    !answer.people.every(isPerson) ||
    !Array.isArray(answer.invitations) ||
    !answer.invitations.every(isInvitation)
  ) {
    throw unusable()
  }
  return {
    organization: { id: answer.organization.id, name: answer.organization.name },
    websites: answer.websites,
    people: answer.people,
    invitations: answer.invitations,
  }
}
