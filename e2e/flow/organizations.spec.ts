import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { flowApiUrl } from './env.ts'
import { founder } from './tenants.ts'
import { realApi, signInThroughTheScreen, unique } from './support.ts'

/**
 * The whole company journey on the REAL API (UC-OR-32, organizations T8). Hal makes an organization,
 * Harbour Co, with two websites through the screens, and adds Nina to both with one link (Editor on
 * the first, Viewer on the second). In a second browser Nina opens the link and makes an account: Nina
 * sees Harbour Co with both websites and nothing of Hal's other organization, writes a page on the
 * first and can only look at the second. Hal's Team lists Nina on both. Someone given only the first
 * website is refused the second, by header and by address. Real browsers, the real admin, the real API
 * and the real database; no other test uses Hal, because this changes Hal's organizations and websites.
 */

const main = (page: Page) => page.getByRole('main')
const bar = (page: Page) => page.getByRole('banner')
const PASSWORD = 'a long enough password'

/** The token the admin keeps for whoever is signed in on this page. */
async function tokenOf(page: Page): Promise<string> {
  const stored = await page.evaluate(() => localStorage.getItem('cms-admin.session'))
  return (JSON.parse(stored ?? '{}') as { accessToken: string }).accessToken
}

test('[UC-OR-32] an owner makes an organization with two websites and adds a person to both with one link; the person sees those two and nothing else', async ({
  page,
  browser,
  request,
}) => {
  const token = unique()
  const company = `Harbour Co ${token}`
  const cafe = `Harbour Cafe ${token}`
  const shop = `Harbour Shop ${token}`
  const email = `nina-${token}@harbour.test`

  // Hal makes the organization through the screen. It has no website yet.
  await signInThroughTheScreen(page, founder.admin)
  await bar(page).getByRole('link', { name: 'New organization' }).click()
  await main(page).getByLabel('Name', { exact: true }).fill(company)
  await main(page).getByRole('button', { name: 'Create organization' }).click()
  await expect(main(page).getByText('Organization created.')).toBeVisible()
  await expect(main(page).getByText(`${company} has no websites yet.`)).toBeVisible()

  // The first website opens on it (Hal owns two organizations now, and is asked which); then the second.
  await main(page).getByRole('link', { name: 'Add your first website' }).click()
  await expect(main(page).getByLabel('Organization').locator('option:checked')).toHaveText(company)
  await main(page).getByLabel('Name', { exact: true }).fill(cafe)
  await main(page).getByLabel('Web address', { exact: true }).fill(`cafe-${token}.test`)
  await main(page).getByRole('button', { name: 'Create site' }).click()
  await expect(page.getByText('Site created.')).toBeVisible()

  await bar(page).getByRole('link', { name: 'New site' }).click()
  await expect(main(page).getByLabel('Organization').locator('option:checked')).toHaveText(company)
  await main(page).getByLabel('Name', { exact: true }).fill(shop)
  await main(page).getByLabel('Web address', { exact: true }).fill(`shop-${token}.test`)
  await main(page).getByRole('button', { name: 'Create site' }).click()
  await expect(page.getByText('Site created.')).toBeVisible()

  // Add person: Nina, Editor on the first and Viewer on the second, with one link.
  await page.goto('/team/new')
  await main(page).getByLabel('Email', { exact: true }).fill(email)
  await main(page).getByRole('checkbox', { name: cafe, exact: true }).check()
  await main(page).getByRole('checkbox', { name: shop, exact: true }).check()
  await main(page).getByLabel(`Role for ${cafe}`, { exact: true }).selectOption('Editor')
  await main(page).getByLabel(`Role for ${shop}`, { exact: true }).selectOption('Viewer')
  await main(page).getByRole('button', { name: 'Make invite link' }).click()
  const link = (await main(page).locator('.invite-link-row code').textContent()) ?? ''
  expect(link).toMatch(/\/invite#[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/)

  // In a second browser, Nina opens the link and makes an account.
  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(link)
  await expect(guest.getByRole('heading', { name: `You're invited to ${company}` })).toBeVisible()
  await expect(guest.getByRole('listitem')).toHaveText([`${cafe} as Editor`, `${shop} as Viewer`])
  await guest.getByLabel('Name').fill('Nina Novak')
  await guest.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await guest.getByRole('button', { name: 'Create account and join' }).click()
  await expect(
    guest.getByText(`Signed in as Nina Novak (${email}). Your role on this site: Editor.`),
  ).toBeVisible()

  // Nina sees Harbour Co with both websites, and nothing of Hal's other organization.
  await expect(bar(guest).getByLabel('Organization', { exact: true })).toHaveCount(0)
  await expect(bar(guest).getByLabel('Site', { exact: true }).locator('option')).toHaveText([
    `${cafe} · Editor`,
    `${shop} · Viewer`,
  ])
  await expect(guest.getByText('Harbour Holdings')).toHaveCount(0)
  await expect(guest.getByText('Harbour Studio')).toHaveCount(0)

  // On the first website Nina writes a page; on the second there is only looking.
  await guest.goto('/pages/new')
  await guest.getByLabel('Title').fill(`Nina's page ${token}`)
  await guest.getByLabel('Slug').fill(`ninas-page-${token}`)
  await guest.getByRole('button', { name: 'Create page' }).click()
  await expect(guest.getByText('Page created.')).toBeVisible()

  await bar(guest)
    .getByLabel('Site', { exact: true })
    .selectOption({ label: `${shop} · Viewer` })
  await guest.goto('/')
  await expect(guest.getByText('Your role on this site: Viewer.')).toBeVisible()
  await expect(guest.getByRole('link', { name: 'Write a page' })).toHaveCount(0)
  const halCafe = await realApi(request, founder.admin, cafe)
  const halShop = await realApi(request, founder.admin, shop)
  const ninaToken = await tokenOf(guest)
  const nina = (siteId: string) => ({
    Authorization: `Bearer ${ninaToken}`,
    'X-Site-Id': siteId,
  })
  const attempt = { type: 'page', title: `Nina on the shop ${token}`, slug: `nina-shop-${token}` }
  expect(
    (
      await request.post(`${flowApiUrl}/content`, { headers: nina(halShop.siteId), data: attempt })
    ).status(),
  ).toBe(403)
  expect(
    (
      await request.post(`${flowApiUrl}/content`, { headers: nina(halCafe.siteId), data: attempt })
    ).status(),
  ).toBe(201)

  // Hal's Team lists Nina on both websites, with each role, and nothing waits any more.
  await page.goto('/team')
  const row = main(page)
    .getByRole('table', { name: 'People' })
    .getByRole('row', { name: /Nina Novak/ })
  await expect(row.getByRole('listitem')).toHaveText([`${cafe} Editor`, `${shop} Viewer`])
  await expect(main(page).getByRole('table', { name: 'Waiting invitations' })).toHaveCount(0)

  // Someone given only the first website (Viewer) is refused the second: by header, and by address.
  const asHal = { Authorization: `Bearer ${await tokenOf(page)}`, 'X-Site-Id': halCafe.siteId }
  const members = (await (
    await request.get(`${flowApiUrl}/members`, { headers: asHal })
  ).json()) as {
    roles: { id: string; name: string }[]
  }
  const invited = await request.post(`${flowApiUrl}/invitations`, {
    headers: asHal,
    data: {
      email: `vic-${token}@harbour.test`,
      roleId: members.roles.find((role) => role.name === 'Viewer')?.id,
    },
  })
  expect(invited.status()).toBe(201)
  const joined = await request.post(`${flowApiUrl}/invitations/accept`, {
    data: {
      token: ((await invited.json()) as { token: string }).token,
      name: 'Vic Viewer',
      password: PASSWORD,
    },
  })
  expect(joined.status()).toBe(200)
  const vicToken = ((await joined.json()) as { accessToken: string }).accessToken
  const vic = (siteId: string) => ({ Authorization: `Bearer ${vicToken}`, 'X-Site-Id': siteId })

  // By header: the second website's id, from someone who is on the first only.
  expect(
    (await request.get(`${flowApiUrl}/content`, { headers: vic(halShop.siteId) })).status(),
  ).toBe(403)
  // By address: a page of the second website, asked for under the first website's header.
  const shopPage = await halShop.createPage({
    type: 'page',
    title: `Shop page ${token}`,
    slug: `shop-page-${token}`,
  })
  expect(
    (
      await request.get(`${flowApiUrl}/content/${shopPage.id}`, { headers: vic(halCafe.siteId) })
    ).status(),
  ).toBe(404)
  // The first website works for them, so the refusals are about whose things they are.
  expect(
    (await request.get(`${flowApiUrl}/content`, { headers: vic(halCafe.siteId) })).status(),
  ).toBe(200)

  await guestContext.close()
})
