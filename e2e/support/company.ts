import { inDays, orchard } from './mock-api.ts'
import type { FakeTeam, MockMembership, MockOrganization } from './mock-api.ts'

/**
 * Kettle & Crumb Ltd as the company team tests and screenshots see it: its owner Ada, three websites
 * with their own five roles, Maya and Tom on some of them, and two waiting invitations (one expired).
 * The ids say which website and which role.
 */

export const id = (n: number) => `0198f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`
export const EVERYTHING = [
  'content.create',
  'content.edit_any',
  'content.edit_own',
  'content.publish',
  'members.manage',
]
export const ROLES = ['Administrator', 'Editor', 'Author', 'Contributor', 'Viewer']

export const kettle: MockOrganization = {
  id: id(0xf1),
  name: 'Kettle & Crumb Ltd',
  ownsOrganization: true,
}

/** Website number `n`, with its own five roles (the ids say which website and which role). */
export function website(n: number, name: string) {
  return {
    id: id(10 + n),
    name,
    roles: ROLES.map((role, at) => ({ id: id(100 * n + at), name: role })),
  }
}
export const cafe = website(1, 'Café')
export const shop = website(2, 'Shop')
export const wholesale = website(3, 'Wholesale')
export const roleOf = (site: ReturnType<typeof website>, name: string) =>
  site.roles.find((role) => role.name === name)!

export const ada = { userId: id(0xa1), name: 'Ada Kettle', email: 'ada@kettle.test' }
export const maya = { userId: id(0xa2), name: 'Maya Thornton', email: 'maya@kettle.test' }
export const tom = { userId: id(0xa3), name: 'Tom Ashworth', email: 'tom@kettle.test' }

/** Ada owns the organization and is on every website; Maya and Tom are people she has added. */
export function theTeam(): FakeTeam {
  return {
    organization: { id: kettle.id, name: kettle.name },
    websites: [cafe, shop, wholesale],
    people: [
      {
        ...ada,
        isOwner: true,
        access: [cafe, shop, wholesale].map((site) => ({
          siteId: site.id,
          role: roleOf(site, 'Administrator'),
        })),
      },
      {
        ...maya,
        isOwner: false,
        access: [{ siteId: cafe.id, role: roleOf(cafe, 'Editor') }],
      },
      {
        ...tom,
        isOwner: false,
        access: [
          { siteId: cafe.id, role: roleOf(cafe, 'Viewer') },
          { siteId: shop.id, role: roleOf(shop, 'Viewer') },
        ],
      },
    ],
    invitations: [
      {
        id: id(0xb1),
        email: 'nina@kettle.test',
        siteId: shop.id,
        role: roleOf(shop, 'Author'),
        expiresAt: inDays(5),
        expired: false,
      },
      {
        id: id(0xb2),
        email: 'old@kettle.test',
        siteId: wholesale.id,
        role: roleOf(wholesale, 'Contributor'),
        expiresAt: inDays(-2),
        expired: true,
      },
    ],
  }
}

/** The person's membership on a website: Administrator and owner, or the role given (not the owner). */
export function membership(
  site: ReturnType<typeof website>,
  role: string,
  owns: boolean,
  organization: MockOrganization = kettle,
): MockMembership {
  return {
    ...orchard,
    site: {
      ...orchard.site,
      id: site.id,
      name: site.name,
      primaryHost: `${site.name.toLowerCase().replace(/\W/g, '')}.test`,
      organizationId: organization.id,
    },
    role: { id: id(900), name: role },
    permissions: EVERYTHING,
    ownsOrganization: owns,
  }
}

export const ownerMemberships = [cafe, shop, wholesale].map((site) =>
  membership(site, 'Administrator', true),
)
