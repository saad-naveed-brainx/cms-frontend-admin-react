import { expect, test } from '@playwright/test'
import type { Dialog, Page } from '@playwright/test'
import {
  fakeContent,
  fakeInvitation,
  fakeMember,
  fakeMembers,
  fulfill,
  maple,
  orchard,
  person,
  signedInAs,
} from './support/mock-api.ts'
import type { FakeInvitation, FakeMember } from './support/mock-api.ts'

/**
 * The Users screen and Add New (users-roles T5), with the API's answers given by a stand-in that
 * follows the real routes' rules (`fakeMembers`). The whole journey on the real API is UC-UR-25.
 */

// The viewer's own time (assumption 7): a zone far from UTC, so a time shown in UTC is wrong.
test.use({ locale: 'en-GB', timezoneId: 'Asia/Karachi' })

const ADMIN = ['content.create', 'content.edit_any', 'content.edit_own', 'members.manage']

const olivia = fakeMember(1, person.name, 'Administrator', {
  userId: person.id,
  email: person.email,
  isOwner: true,
})
const ada = fakeMember(2, 'Ada', 'Administrator')
const eddie = fakeMember(3, 'Eddie', 'Editor')
const bold = fakeMember(4, '<b>Bold</b>', 'Viewer', { email: 'bold@orchard.test' })
const team = [olivia, ada, eddie, bold]

// A fixed moment far ahead, so the line it gives never changes: 09:30 UTC is 14:30 in Karachi.
const waiting = fakeInvitation(1, 'nina@orchard.test', 'Author', '2099-10-26T09:30:00.000Z')
const expired = fakeInvitation(2, 'omar@orchard.test', 'Viewer', '2026-01-02T09:00:00.000Z')

const menu = (page: Page) => page.getByRole('navigation', { name: 'Main' })
const usersEntry = (page: Page) => menu(page).getByRole('link', { name: 'Users', exact: true })
const screen = (page: Page) => page.getByRole('main')
const rowOf = (page: Page, email: string) => page.getByRole('row').filter({ hasText: email })
const copyButton = (page: Page) => screen(page).getByRole('button', { name: /^Copy/ })
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText())

/** The link on screen, written out or in a read-only box. */
const shownLink = (page: Page, link: string) =>
  screen(page).getByText(link).or(page.locator(`input[value="${link}"]`))

/** Signed in on Orchard Bakery as an Administrator, on the Dashboard. */
async function signedIn(
  page: Page,
  people: { members: FakeMember[]; invitations?: FakeInvitation[] },
) {
  await fakeContent(page, [])
  const session = await signedInAs(page, ADMIN, { role: 'Administrator' })
  const api = await fakeMembers(page, session, people)
  return { session, api }
}

/**
 * Presses Remove on someone's row and answers its question. The use case says what is asked, not
 * how: the browser's own box and a box on the page (a dialog, or a named region as on the Sites
 * screen) both do, so the answer goes to whichever appears.
 */
async function pressRemove(page: Page, member: FakeMember, answer: 'yes' | 'no') {
  const question = `Remove ${member.name} from ${orchard.site.name}? Their pages stay.`
  const askedByBrowser: string[] = []
  const answerBrowser = (dialog: Dialog) => {
    askedByBrowser.push(dialog.message())
    return answer === 'yes' ? dialog.accept() : dialog.dismiss()
  }
  page.once('dialog', answerBrowser)
  await rowOf(page, member.email).getByRole('button', { name: /^Remove/ }).click()
  page.off('dialog', answerBrowser)
  if (askedByBrowser.length > 0) {
    expect(askedByBrowser).toEqual([question])
    return
  }

  const box = page
    .getByRole('dialog')
    .or(page.getByRole('alertdialog'))
    .or(page.getByRole('region'))
    .filter({ hasText: question })
  await expect(box).toBeVisible()
  await box
    .getByRole('button', { name: answer === 'yes' ? /^(Yes|Remove)/ : /^(No|Cancel|Keep)/ })
    .click()
}

test('[UC-UR-20] Olivia opens Users from the menu and by address, sees people and invites, changes a role at once, removes someone after being asked, cancels an invite without being asked, and is refused removing herself', async ({
  page,
}) => {
  const { api } = await signedIn(page, { members: team, invitations: [waiting, expired] })

  await usersEntry(page).click()
  await expect(page).toHaveURL(/\/users$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()

  // The address opens the same screen, so what follows is checked after a reload.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()

  // Names, emails and roles. The owner's role need not be a choice, so it is only read.
  await expect(rowOf(page, olivia.email)).toContainText(olivia.name)
  await expect(rowOf(page, olivia.email)).toContainText('Administrator')
  for (const member of [ada, eddie]) {
    await expect(rowOf(page, member.email)).toContainText(member.name)
    await expect(
      rowOf(page, member.email).getByRole('option', { selected: true }),
    ).toHaveText(member.role.name)
  }
  await expect(rowOf(page, eddie.email).getByRole('option')).toHaveText([
    'Administrator',
    'Editor',
    'Author',
    'Contributor',
    'Viewer',
  ])

  // A name is shown as the characters it is.
  await expect(rowOf(page, bold.email).getByText('<b>Bold</b>', { exact: true })).toBeVisible()

  // Invites: when the link stops working, in the viewer's time, or that it has.
  await expect(rowOf(page, waiting.email)).toContainText('Author')
  await expect(rowOf(page, waiting.email)).toContainText('Link works until 26 Oct, 14:30')
  await expect(rowOf(page, expired.email)).toContainText('Viewer')
  await expect(rowOf(page, expired.email)).toContainText('Expired')
  await expect(rowOf(page, expired.email)).not.toContainText('Link works until')

  // A role change saves at once, with no Save button, and says so in plain English.
  await expect(screen(page).getByRole('button', { name: 'Save' })).toHaveCount(0)
  await rowOf(page, eddie.email).getByRole('combobox').selectOption('Author')
  await expect(page.getByRole('status')).toHaveText('Eddie is now an Author.')
  await expect(rowOf(page, eddie.email).getByRole('option', { selected: true })).toHaveText(
    'Author',
  )
  expect(api.calls).toContain(`PATCH /members/${eddie.userId}`)
  await rowOf(page, ada.email).getByRole('combobox').selectOption('Viewer')
  await expect(page.getByRole('status')).toHaveText('Ada is now a Viewer.')

  // Remove asks first: saying no sends nothing.
  await pressRemove(page, eddie, 'no')
  await expect(rowOf(page, eddie.email)).toBeVisible()
  expect(api.calls).not.toContain(`DELETE /members/${eddie.userId}`)

  // Saying yes removes them, with the button disabled while the request runs.
  const finishRemoving = api.hold()
  await pressRemove(page, eddie, 'yes')
  await expect(screen(page).getByRole('button', { disabled: true })).not.toHaveCount(0)
  finishRemoving()
  await expect(rowOf(page, eddie.email)).toHaveCount(0)
  expect(api.members.map((member) => member.email)).not.toContain(eddie.email)

  // Cancel on an invite does not ask. A question left unanswered would stop this request.
  const finishCancelling = api.hold()
  const cancel = rowOf(page, waiting.email).getByRole('button', { name: /^Cancel/ })
  await cancel.click()
  await expect(cancel).toBeDisabled()
  finishCancelling()
  await expect(rowOf(page, waiting.email)).toHaveCount(0)
  await expect(rowOf(page, expired.email)).toBeVisible()
  expect(api.invitations.map((invitation) => invitation.email)).toEqual([expired.email])

  // The owner's refusal comes from the API, in its own words.
  await pressRemove(page, olivia, 'yes')
  await expect(page.getByRole('alert')).toContainText(
    "The organisation's owner stays an Administrator.",
  )
  await expect(rowOf(page, olivia.email)).toBeVisible()
})

test('[UC-UR-20] changing your own role takes effect at once: without members.manage the menu has no Users entry', async ({
  page,
}) => {
  const me = { ...olivia, isOwner: false }
  await signedIn(page, { members: [{ ...ada, isOwner: true }, me] })
  await page.goto('/users')
  await expect(usersEntry(page)).toBeVisible()

  await rowOf(page, me.email).getByRole('combobox').selectOption('Editor')

  await expect(usersEntry(page)).toHaveCount(0)
})

test('[UC-UR-20] removing yourself takes effect at once: the site leaves the Site control', async ({
  page,
}) => {
  const me = { ...olivia, isOwner: false }
  const { session } = await signedIn(page, { members: [{ ...ada, isOwner: true }, me] })
  session.memberships.push({ ...maple })
  await page.goto('/users')
  await expect(page.getByRole('banner')).toContainText(orchard.site.name)

  await pressRemove(page, me, 'yes')

  await expect(page.getByRole('banner')).toContainText(maple.site.name)
  await expect(page.getByRole('banner')).not.toContainText(orchard.site.name)
})

test('[UC-UR-21] Add New shows a refusal next to the email box, then a link and a Copy button in view; Copy puts the link on the clipboard', async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const { api } = await signedIn(page, { members: team })
  await page.goto('/users')
  await screen(page).getByRole('link', { name: /^Add New/ }).click()
  await expect(page).toHaveURL(/\/users\/new$/)

  const email = screen(page).getByLabel('Email')
  const send = screen(page).getByRole('button', { name: /invite|send|add|link/i })
  await screen(page).getByLabel('Role').selectOption('Contributor')

  // The API's 409: this person is already here.
  await email.fill(eddie.email)
  await send.click()
  await expect(email).toHaveAccessibleDescription(
    /eddie@orchard\.test is already a member of this site\./,
  )

  // The API's 400 on the email: one a browser's own check lets through.
  api.override = (route, request) => {
    if (request.method() !== 'POST') return false
    void fulfill(route, 400, {
      message: 'Invalid request',
      errors: ['email: Invalid email address'],
    })
    return true
  }
  await email.fill('sara@orchard.test')
  await send.click()
  await expect(email).toHaveAccessibleDescription(/Invalid email address/)
  api.override = null
  expect(api.tokens).toEqual([])

  // Sent: the button waits for the answer, then the link is there to copy.
  const finishSending = api.hold()
  await send.click()
  await expect(screen(page).getByRole('button', { disabled: true })).not.toHaveCount(0)
  finishSending()
  await expect.poll(() => api.tokens.length).toBe(1)
  const link = `${baseURL}/invite#${api.tokens[0]}`
  await expect(shownLink(page, link)).toBeInViewport({ ratio: 1 })
  await expect(copyButton(page)).toBeInViewport({ ratio: 1 })

  await copyButton(page).click()
  await expect(screen(page)).toContainText('Copied')
  await expect.poll(() => clipboard(page)).toBe(link)

  // The invite is waiting in the list, with the role picked.
  await usersEntry(page).click()
  await expect(rowOf(page, 'sara@orchard.test')).toContainText('Contributor')
  await expect(rowOf(page, 'sara@orchard.test')).toContainText('Link works until')
})

test('[UC-UR-21] New link, far down a long list, shows a different link in view and says the earlier one stops working; an expired invite works again', async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const longTeam = Array.from({ length: 24 }, (_, at) => fakeMember(10 + at, `Person${at}`, 'Viewer'))
  const { api } = await signedIn(page, {
    members: [olivia, ...longTeam],
    invitations: [waiting, expired],
  })
  await page.goto('/users')
  const invitation = rowOf(page, waiting.email)
  const newLink = invitation.getByRole('button', { name: /^New link/ })

  const finishRenewing = api.hold()
  await newLink.click()
  await expect(invitation.getByRole('button', { disabled: true })).not.toHaveCount(0)
  finishRenewing()
  await expect.poll(() => api.tokens.length).toBe(1)
  const first = `${baseURL}/invite#${api.tokens[0]}`
  await expect(shownLink(page, first)).toBeInViewport({ ratio: 1 })

  await newLink.click()
  await expect.poll(() => api.tokens.length).toBe(2)
  const second = `${baseURL}/invite#${api.tokens[1]}`
  expect(second).not.toBe(first)
  await expect(shownLink(page, second)).toBeInViewport({ ratio: 1 })
  await expect(shownLink(page, first)).toHaveCount(0)
  await expect(copyButton(page)).toBeInViewport({ ratio: 1 })
  await expect(
    page.getByText(/(earlier|old|previous).*(stop(s|ped)? working|no longer works)/i),
  ).toBeInViewport()

  await copyButton(page).click()
  await expect(screen(page)).toContainText('Copied')
  await expect.poll(() => clipboard(page)).toBe(second)

  // An expired invite stays until it is given a new link, and then it is waiting again.
  await rowOf(page, expired.email).getByRole('button', { name: /^New link/ }).click()
  await expect(rowOf(page, expired.email).filter({ hasText: 'Link works until' })).toBeVisible()
  await expect(rowOf(page, expired.email).filter({ hasText: 'Expired' })).toHaveCount(0)
})
