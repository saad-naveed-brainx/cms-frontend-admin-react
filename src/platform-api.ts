import { ApiError, isRecord } from './api.ts'
import { authed } from './session.ts'

/**
 * The super admin's routes, as the admin uses them (api/src/platform-admin/, platform-admin T2 to T5,
 * `../docs/DECISIONS.md` D-062). Each answer is checked for the fields the screens read; anything else
 * is treated as a failure. The API decides who may call them (admin invariant 3).
 */

export type PlatformStatus = 'active' | 'suspended' | 'awaiting_owner'

export type PlatformOwner = { id: string; email: string; name: string }

export type PlatformOrganization = {
  id: string
  name: string
  status: PlatformStatus
  owner: PlatformOwner | null
  /** The email an owner link waits for, while the organization has no owner. */
  pendingOwnerEmail: string | null
  websites: number
  /** ISO 8601 */
  createdAt: string
}

/** A one-time owner link: the API shows its secret once and keeps only a fingerprint. */
export type OwnerLink = { email: string; name: string; token: string; expiresAt: string }

export type OwnerChange = { id: string; owner: PlatformOwner | null; ownerInvitation: OwnerLink | null }

const unusable = () => new ApiError(502)
const isText = (value: unknown): value is string => typeof value === 'string'

function isOwner(value: unknown): value is PlatformOwner {
  return isRecord(value) && isText(value.id) && isText(value.email) && isText(value.name)
}

function isOrganization(value: unknown): value is PlatformOrganization {
  return (
    isRecord(value) &&
    isText(value.id) &&
    isText(value.name) &&
    (value.status === 'active' || value.status === 'suspended' || value.status === 'awaiting_owner') &&
    (value.owner === null || isOwner(value.owner)) &&
    (value.pendingOwnerEmail === null || isText(value.pendingOwnerEmail)) &&
    typeof value.websites === 'number' &&
    isText(value.createdAt)
  )
}

function isLink(value: unknown): value is OwnerLink {
  return (
    isRecord(value) &&
    isText(value.email) &&
    isText(value.name) &&
    isText(value.token) &&
    isText(value.expiresAt)
  )
}

function checkedChange(answer: unknown): OwnerChange {
  if (
    !isRecord(answer) ||
    !isText(answer.id) ||
    !(answer.owner === null || isOwner(answer.owner)) ||
    !(answer.ownerInvitation === null || isLink(answer.ownerInvitation))
  ) {
    throw unusable()
  }
  return { id: answer.id, owner: answer.owner, ownerInvitation: answer.ownerInvitation }
}

/** Every organization, by name. */
export async function fetchPlatformOrganizations(): Promise<PlatformOrganization[]> {
  const answer = await authed('/platform/organizations')
  if (!isRecord(answer) || !Array.isArray(answer.items) || !answer.items.every(isOrganization)) {
    throw unusable()
  }
  return answer.items
}

/** Makes an organization for an owner: an existing account at once, or a new person through a link. */
export async function createPlatformOrganization(body: {
  name: string
  ownerEmail: string
  ownerName?: string
}): Promise<OwnerChange & { name: string }> {
  const answer = await authed('/platform/organizations', { method: 'POST', body })
  if (!isRecord(answer) || !isText(answer.name)) throw unusable()
  return { ...checkedChange(answer), name: answer.name }
}

export async function setOrganizationSuspended(id: string, suspended: boolean): Promise<void> {
  const answer = await authed(
    `/platform/organizations/${encodeURIComponent(id)}/${suspended ? 'suspend' : 'reactivate'}`,
    { method: 'POST' },
  )
  if (!isRecord(answer) || !isText(answer.id)) throw unusable()
}

export async function changeOrganizationOwner(
  id: string,
  body: { ownerEmail: string; ownerName?: string; removeOld: boolean },
): Promise<OwnerChange> {
  const answer = await authed(`/platform/organizations/${encodeURIComponent(id)}/owner`, {
    method: 'POST',
    body,
  })
  return checkedChange(answer)
}

/** Deletes an organization and everything on it, for good: the name must be sent exactly. The API answers 204. */
export async function deletePlatformOrganization(id: string, confirmName: string): Promise<void> {
  await authed(`/platform/organizations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: { confirmName },
  })
}
