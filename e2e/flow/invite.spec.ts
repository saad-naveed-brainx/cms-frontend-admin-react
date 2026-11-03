import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { inviter } from './tenants.ts'
import { publicPage, signInThroughTheScreen, unique } from './support.ts'

/**
 * The whole invite journey on the REAL API (UC-UR-25, users-roles T7): Ola, who administers her
 * site, invites a new person as a Contributor on the Users screen and copies the link; in a second
 * browser the person opens it, makes an account and writes a draft; Ola sees the draft with the
 * person's name as its author and publishes it. No other test uses her site.
 */

const { site, host } = inviter.tenant
const main = (page: Page) => page.getByRole('main')

test('[UC-UR-25] an Administrator invites a Contributor, who joins from the link, writes a draft, and has it published', async ({
  page,
  browser,
  request,
}) => {
  const email = `nina-${unique()}@invite.test`
  const title = `Nina's draft ${unique()}`
  const slug = `ninas-draft-${unique()}`

  // Ola makes the invite on the Users screen and takes the link from the screen.
  await signInThroughTheScreen(page, inviter.admin)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' }).click()
  await main(page).getByRole('link', { name: /^Add New/ }).click()
  await main(page).getByLabel('Email').fill(email)
  await main(page).getByLabel('Role').selectOption('Contributor')
  await main(page).getByRole('button', { name: 'Make invite link' }).click()
  const link = (await page.locator('.invite-link code').textContent()) ?? ''
  expect(link).toMatch(/\/invite#[A-Za-z0-9_-]{43}$/)

  // In a second browser, the person opens the link and makes an account.
  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(link)
  await expect(
    guest.getByRole('heading', { name: `You're invited to ${site} as Contributor` }),
  ).toBeVisible()
  await guest.getByLabel('Name').fill('Nina Novak')
  await guest.getByLabel('Password', { exact: true }).fill('a long enough password')
  await guest.getByRole('button', { name: 'Create account and join' }).click()
  await expect(
    guest.getByText(`Signed in as Nina Novak (${email}). Your role on this site: Contributor.`),
  ).toBeVisible()

  // She writes a draft, and has no Publish button for it.
  await guest.goto('/pages/new')
  await guest.getByLabel('Title').fill(title)
  await guest.getByLabel('Slug').fill(slug)
  await guest.getByRole('button', { name: 'Create page' }).click()
  await expect(guest.getByText('Page created.')).toBeVisible()
  await expect(guest.getByRole('button', { name: 'Publish' })).toHaveCount(0)
  expect((await publicPage(request, host, `/${slug}`)).status).toBe(404)

  // The link worked once: opened again, it is dead.
  const again = await (await browser.newContext()).newPage()
  await again.goto(link)
  await expect(again.getByRole('alert')).toHaveText(
    'This invite is no longer valid. Ask for a new one.',
  )

  // Ola sees the draft with Nina as its author, and publishes it.
  await page.goto('/pages')
  const row = page.getByRole('row', { name: new RegExp(title) })
  await expect(row).toContainText('Nina Novak')
  await expect(row).toContainText('Draft')
  await row.getByRole('link', { name: title }).click()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByText('Published.')).toBeVisible()
  expect((await publicPage(request, host, `/${slug}`)).status).toBe(200)

  // And the Users screen lists her, as a Contributor, with no invite waiting.
  await page.goto('/users')
  const person = page.getByRole('row', { name: /Nina Novak/ })
  await expect(person).toContainText(email)
  await expect(person.getByLabel('Access for Nina Novak').locator('option:checked')).toHaveText(
    'Contributor',
  )
  await expect(main(page).getByText('Link works until')).toHaveCount(0)

  await guestContext.close()
})
