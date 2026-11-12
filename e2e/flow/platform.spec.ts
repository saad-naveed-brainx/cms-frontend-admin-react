import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { platformAdmin } from './env.ts'
import { signInThroughTheScreen, unique } from './support.ts'

/**
 * The super admin's journey on the REAL API (UC-PA-05, platform-admin T8, D-062): the platform's
 * super admin makes an organization for a person who has no account, through the Platform screens, and
 * sends them the one-time link. In a second browser the person opens it, makes an account and is the
 * owner of an organization with no website yet. The super admin sees it become Active, and cannot be
 * seen inside it. Real browsers, the real admin, the real API and the real database.
 */

const main = (page: Page) => page.getByRole('main')
const bar = (page: Page) => page.getByRole('banner')
const PASSWORD = 'a long enough password'

test('[UC-PA-05] a super admin makes an organization for a new person, who opens the link and owns it', async ({
  page,
  browser,
}) => {
  const token = unique()
  const company = `Platform Co ${token}`
  const email = `nia-${token}@platform.test`

  await signInThroughTheScreen(page, platformAdmin)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Platform' })
    .first()
    .click()
  await main(page).getByRole('link', { name: 'Add New' }).click()
  await main(page).getByLabel('Name', { exact: true }).fill(company)
  await main(page).getByLabel('Owner’s email').fill(email)
  await main(page).getByLabel('Owner’s name').fill('Nia Novak')
  await main(page).getByRole('button', { name: 'Create organization' }).click()
  await expect(main(page).getByText(`${company} was created.`)).toBeVisible()
  const link = (await main(page).locator('.invite-link-row code').textContent()) ?? ''
  expect(link).toMatch(/\/invite#[A-Za-z0-9_-]{43}$/)

  await main(page).getByRole('link', { name: 'Back to Organizations' }).click()
  const row = main(page)
    .getByRole('table', { name: 'Organizations' })
    .getByRole('row', { name: new RegExp(company) })
  await expect(row).toContainText('Awaiting owner')

  // Nia opens the link in her own browser, makes an account, and owns the organization.
  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(link)
  await expect(
    guest.getByRole('heading', { name: `You're invited to ${company} as Owner` }),
  ).toBeVisible()
  await guest.getByLabel('Name').fill('Nia Novak')
  await guest.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await guest.getByRole('button', { name: 'Create account and join' }).click()
  await expect(bar(guest).getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(main(guest).getByText(`${company} has no websites yet.`)).toBeVisible()
  await expect(
    guest.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Platform' }),
  ).toHaveCount(0)
  await guest.goto('/platform/organizations')
  // An owner with no website has no screen at that address: the Platform list is not shown to her.
  await expect(guest.getByRole('heading', { level: 1, name: 'Organizations' })).toHaveCount(0)
  await expect(guest.getByRole('heading', { level: 1, name: 'No websites yet' })).toBeVisible()

  // The link is used up, and the super admin sees the organization is Active with its owner.
  await page.reload()
  const active = main(page)
    .getByRole('table', { name: 'Organizations' })
    .getByRole('row', { name: new RegExp(company) })
  await expect(active).toContainText('Active')
  await expect(active).toContainText(email)
  await guestContext.close()
})
