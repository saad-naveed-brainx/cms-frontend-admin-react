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

/**
 * A sixth person, whose site's front page (the Home page every site starts with, D-037) a test takes
 * down and puts back through the screen, so no other test uses her.
 */
export const greeter = {
  admin: { email: 'fern@front.test', name: 'Fern Front', password: 'front-flow-password' },
  tenant: { organization: 'Front Room Ltd', site: 'Front Room', host: 'front.test' },
}

/**
 * A seventh person, who deletes their only site through the Sites screen (D-039), so no other test
 * uses her.
 */
export const remover = {
  admin: { email: 'rae@remove.test', name: 'Rae Remover', password: 'remove-flow-password' },
  tenant: { organization: 'Remove Co', site: 'Removal Studio', host: 'removal.test' },
}

/**
 * An eighth person, who makes a content type on their site (D-043), which adds an entry to its menu,
 * so no other test uses her.
 */
export const typer = {
  admin: { email: 'tia@types.test', name: 'Tia Typer', password: 'types-flow-password' },
  tenant: { organization: 'Type Works', site: 'Type Studio', host: 'types.test' },
}

/**
 * A ninth person, who invites someone on the Users screen and sees them join (users-roles T7). Her
 * site gains a member and a page by someone else, so no other test uses her.
 */
export const inviter = {
  admin: { email: 'ola@invite.test', name: 'Ola Invite', password: 'invite-flow-password' },
  tenant: { organization: 'Invite House Ltd', site: 'Invite House', host: 'invite.test' },
}

/**
 * A tenth person, who walks the company journey (organizations T8): Hal makes an organization with two
 * websites through the screens and adds Nina to both with one link. That changes Hal's organizations and
 * websites, and Hal's team, so no other test uses Hal.
 */
export const founder = {
  admin: { email: 'hal@harbour.test', name: 'Hal Harbour', password: 'harbour-flow-password' },
  tenant: { organization: 'Harbour Holdings', site: 'Harbour Studio', host: 'harbour.test' },
}

/**
 * An eleventh person, who walks the version-history journey (version-history T5): she saves a page twice
 * through the screen, looks at the oldest version, restores it and saves, and a Viewer is refused its
 * versions. Her site gains pages, versions and a member, so no other test uses her.
 */
export const historian = {
  admin: { email: 'hana@history.test', name: 'Hana History', password: 'history-flow-password' },
  tenant: { organization: 'History Press Ltd', site: 'History House', host: 'history.test' },
}

/** Everyone with a site of their own, each made by the real seed command. */
export const people = [
  solo,
  maker,
  finisher,
  stylist,
  greeter,
  remover,
  typer,
  inviter,
  founder,
  historian,
]
