import { ApiError, isRecord } from './api.ts'
import { authed } from './session.ts'

/**
 * Creating a site, as the admin uses it (api/src/provisioning/site-creation.controller.ts). Each
 * answer is checked for the fields the screen reads; anything else is treated as a failure.
 */

export type Organization = { id: string; name: string }

export type CreatedSite = {
  organization: Organization
  site: { id: string; name: string }
  hostnames: string[]
}

const unusable = () => new ApiError(502)

function isNamed(value: unknown): value is Organization {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
}

/** The organisations the signed-in person owns: the only ones they can add a site to. */
export async function fetchOrganizations(): Promise<Organization[]> {
  const answer = await authed('/organizations')
  if (!isRecord(answer) || !Array.isArray(answer.items) || !answer.items.every(isNamed)) {
    throw unusable()
  }
  return answer.items
}

export async function createSite(body: {
  name: string
  hostnames: string[]
  organizationId?: string
}): Promise<CreatedSite> {
  const answer = await authed('/sites', { method: 'POST', body })
  if (
    !isRecord(answer) ||
    !isNamed(answer.organization) ||
    !isNamed(answer.site) ||
    !Array.isArray(answer.hostnames) ||
    !answer.hostnames.every((hostname) => typeof hostname === 'string')
  ) {
    throw unusable()
  }
  return {
    organization: answer.organization,
    site: answer.site,
    hostnames: answer.hostnames,
  }
}
