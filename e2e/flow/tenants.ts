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

/**
 * A fourth person, who walks the whole way through the screens (create a site, a page, add a block,
 * publish) in one test. She makes a site there, so her list of sites changes, and no other test uses her.
 */
export const finisher = {
  admin: { email: 'fay@finish.test', name: 'Fay Finish', password: 'finish-flow-password' },
  tenant: { organization: 'Finish Line Ltd', site: 'Finish Studio', host: 'finish.test' },
}

/**
 * A fifth person, who changes their site's name and look on the Appearance screen (GOV-04): that
 * renames the site, which other tests find by name, so no other test uses her.
 */
export const stylist = {
  admin: { email: 'sam@style.test', name: 'Sam Stylist', password: 'style-flow-password' },
  tenant: { organization: 'Style House Ltd', site: 'Style House', host: 'style.test' },
}

/** Everyone with a site of their own, each made by the real seed command. */
export const people = [solo, maker, finisher, stylist]
