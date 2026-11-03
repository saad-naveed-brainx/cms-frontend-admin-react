import { expect, test } from '@playwright/test'
import {
  fakeContent,
  fakeInvitation,
  fakeInvites,
  fakeMember,
  fakeMembers,
  fulfill,
  person,
  signedInAs,
} from '../support/mock-api.ts'
import type { FakeInvite } from '../support/mock-api.ts'

/**
 * Screenshots of the Users screen, Add New with its link and the invite page against the approved
 * baselines (users-roles T7, UC-UR-26). The API's answers are replaced, with the same people, the same
 * link and the same dates every time, so the pictures do not change between runs; the real journey is
 * in e2e/flow/invite.spec.ts.
 */

const ADMIN = ['content.create', 'content.edit_any', 'content.edit_own', 'members.manage']

const people = [
  fakeMember(1, person.name, 'Administrator', {
    userId: person.id,
    email: person.email,
    isOwner: true,
  }),
  fakeMember(2, 'Ada', 'Administrator'),
  fakeMember(3, 'Eddie Editor-With-A-Long-Surname', 'Editor', {
    email: 'eddie.editor-with-a-long-surname@orchard-bakery-and-cafe.test',
  }),
  fakeMember(4, 'Vic Viewer', 'Viewer'),
]
const waiting = fakeInvitation(1, 'nina@orchard.test', 'Author', '2099-10-26T09:30:00.000Z')
const expired = fakeInvitation(
  2,
  'omar-with-a-rather-long-email-address@orchard-bakery-and-cafe.test',
  'Viewer',
  '2026-01-02T09:00:00.000Z',
)

// What the stand-in answers when Add New makes a link, fixed so the picture is the same every time.
const MADE = {
  invitation: fakeInvitation(
    3,
    'nina-with-a-rather-long-email-address@orchard-bakery-and-cafe.test',
    'Contributor',
    '2099-10-26T09:30:00.000Z',
  ),
  token: 'a-link-secret-of-forty-three-characters-0123456',
}

const NEW: FakeInvite = {
  token: 'visual-new',
  siteName: 'Orchard Bakery',
  roleName: 'Contributor',
  email: 'nina-with-a-rather-long-email-address@orchard-bakery-and-cafe.test',
  hasAccount: false,
}
const KNOWN: FakeInvite = { ...NEW, token: 'visual-known', roleName: 'Viewer', hasAccount: true }

for (const width of [375, 768, 1280]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, locale: 'en-GB', timezoneId: 'Europe/London' })

    test('[UC-UR-26] the Users screen looks as approved', async ({ page }) => {
      await fakeContent(page, [])
      const session = await signedInAs(page, ADMIN, { role: 'Administrator' })
      await fakeMembers(page, session, { members: people, invitations: [waiting, expired] })
      await page.goto('/users')
      await expect(page.getByRole('table', { name: 'People' })).toBeVisible()
      await expect(page).toHaveScreenshot(`users-${width}.png`, { fullPage: true })
    })

    test('[UC-UR-26] Add New with its link looks as approved', async ({ page }) => {
      await fakeContent(page, [])
      const session = await signedInAs(page, ADMIN, { role: 'Administrator' })
      const api = await fakeMembers(page, session, { members: people })
      api.override = async (route, request) => {
        if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/invitations') {
          return false
        }
        await fulfill(route, 201, MADE)
        return true
      }
      await page.goto('/users/new')
      await page.getByLabel('Email').fill(MADE.invitation.email)
      await page.getByLabel('Role').selectOption('Contributor')
      await page.getByRole('button', { name: 'Make invite link' }).click()
      await expect(page.getByRole('heading', { name: /^Invite link for/ })).toBeVisible()
      // The link holds the admin's own address and port, which change between slots and machines.
      await expect(page).toHaveScreenshot(`add-new-link-${width}.png`, {
        fullPage: true,
        mask: [page.locator('.invite-link code')],
      })
    })

    test('[UC-UR-26] the invite page looks as approved: a new account, an existing one and a dead link', async ({
      page,
    }) => {
      await fakeInvites(page, [NEW, KNOWN])
      const heading = (name: RegExp) => page.getByRole('heading', { name })

      await page.goto('/invite#visual-new')
      await expect(heading(/^You're invited to/)).toBeVisible()
      await expect(page).toHaveScreenshot(`invite-new-${width}.png`, { fullPage: true })

      // The same form with its problems showing.
      await page.getByRole('button', { name: 'Create account and join' }).click()
      await expect(page.locator('#name-error')).toBeVisible()
      await expect(page).toHaveScreenshot(`invite-new-problems-${width}.png`, { fullPage: true })

      await page.goto('/invite#visual-known')
      await expect(heading(/^You're invited to/)).toBeVisible()
      await expect(page.getByLabel('Name')).toHaveCount(0)
      await expect(page).toHaveScreenshot(`invite-known-${width}.png`, { fullPage: true })

      await page.goto('/invite#not-a-link')
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(page).toHaveScreenshot(`invite-dead-${width}.png`, { fullPage: true })
    })
  })
}
