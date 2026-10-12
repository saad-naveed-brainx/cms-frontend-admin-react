import { expect, test } from '@playwright/test'
import { flowApiUrl } from './env.ts'
import { remover } from './tenants.ts'
import { signInThroughTheScreen } from './support.ts'

/**
 * Deleting a site on the REAL flow (D-039): Rae owns her organisation and its one site, deletes it on
 * the Sites screen, and the real API agrees it is gone. No other test uses her.
 */

const { site, host } = remover.tenant

test('[UC-SD-07] the owner deletes her site on the Sites screen: it is gone from her list, from sign-in and from its address', async ({
  page,
  request,
}) => {
  expect((await request.get(`${flowApiUrl}/sites/resolve?host=${host}`)).status()).toBe(200)

  await signInThroughTheScreen(page, remover.admin)
  await page.goto('/sites')
  const row = page.getByRole('row', { name: new RegExp(site) })
  await expect(row).toContainText('Current site')
  await row.getByRole('button', { name: `Delete ${site}` }).click()

  const panel = page.getByRole('region', { name: `Delete ${site}?` })
  await expect(panel).toContainText(`its web address (${host})`)
  await page.getByLabel(`Type ${site} to confirm`).fill(site)
  await page.getByRole('button', { name: 'Delete this site' }).click()

  await expect(page.getByRole('status')).toHaveText(`${site} was deleted.`)
  await expect(page.getByText('Your account is not a member of any site yet.')).toBeVisible()

  // The real API agrees: the address answers nothing, and sign-in lists no site.
  expect((await request.get(`${flowApiUrl}/sites/resolve?host=${host}`)).status()).toBe(404)
  const login = await request.post(`${flowApiUrl}/auth/login`, {
    data: { email: remover.admin.email, password: remover.admin.password },
  })
  expect((await login.json()).memberships).toEqual([])

  // A reload keeps her signed in, with nothing to work on.
  await page.reload()
  await page.goto('/sites')
  await expect(page.getByText('Your account is not a member of any site yet.')).toBeVisible()
})
