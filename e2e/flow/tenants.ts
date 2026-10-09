/**
 * The clients the real-flow tests sign in to. They are created, before any test runs, by the real
 * seed command of the api repo (start-api.mjs), so these values live only in the tests.
 *
 * One person administers both: the second client is created for an email that already exists,
 * which is what gives them two sites to switch between.
 */
export const admin = {
  email: 'olivia@orchard.test',
  name: 'Olivia Orchard',
  password: 'orchard-flow-password',
}

export const tenants = [
  { organization: 'Orchard Holdings', site: 'Orchard Bakery', host: 'orchard.test' },
  { organization: 'Maple Group', site: 'Maple Books', host: 'maple.test' },
]

export const adminRole = 'Administrator'

/**
 * A second person with one site no other test touches, so a test can count its pages exactly (the
 * paging test needs a list nobody else adds to).
 */
export const solo = {
  admin: { email: 'paula@birch.test', name: 'Paula Birch', password: 'birch-flow-password' },
  tenant: { organization: 'Birch Studio Ltd', site: 'Birch Studio', host: 'birch.test' },
}

/**
 * A third person who owns one organisation with one site, and is the only one who creates sites
 * through the screen: that changes her list of sites, which other tests count.
 */
export const maker = {
  admin: { email: 'mia@maker.test', name: 'Mia Maker', password: 'maker-flow-password' },
  tenant: { organization: 'Maker Collective', site: 'Maker Studio', host: 'maker.test' },
}

/** Everyone with a site of their own, each made by the real seed command. */
export const people = [solo, maker]
