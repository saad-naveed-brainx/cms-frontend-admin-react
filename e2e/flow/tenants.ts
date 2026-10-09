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
