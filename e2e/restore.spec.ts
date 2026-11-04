import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  fakeContent,
  fakePage,
  fakeVersion,
  fakeVersions,
  fulfill,
  signedInAs,
} from './support/mock-api.ts'
import type { FakePage, FakeVersion } from './support/mock-api.ts'

/**
 * Restore (version-history T4, `docs/features/version-history/`, D-058): the edit screen opened with
 * `?restore=<versionId>` loads that version's title, blocks and search fields as unsaved changes, says
 * so, and takes the parameter out of the address. Nothing is written until Save, and Save then makes a
 * new version like any save. The API's answers are stood in for; the whole journey on the real API is
 * e2e/flow/versions.spec.ts (T5).
 */

test.use({ timezoneId: 'UTC' })

const EDIT_ANY = ['content.create', 'content.edit_any', 'content.edit_own', 'content.publish']
const LEAVE = 'You have unsaved changes. Leave without saving them?'

const hero = (headline: string) => ({ type: 'hero', headline })
const card = (page: Page, title: string) => page.getByRole('region', { name: title })
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })
const titleBox = (page: Page) => page.getByLabel('Title', { exact: true })
const notice = (page: Page) => page.locator('main > p.notice')

/** The page being edited, its versions (newest first) and a signed-in Editor. */
async function setup(page: Page, pageFields: Partial<FakePage>, versions: FakeVersion[]) {
  const item = fakePage(1, { title: 'Opening hours', slug: 'opening-hours', ...pageFields })
  const content = await fakeContent(page, [item])
  const versionApi = await fakeVersions(page, { [item.id]: versions })
  await signedInAs(page, EDIT_ANY, { role: 'Editor' })
  return { item, content, versionApi }
}

/** The calls that would change something: everything but a read. */
const writes = (api: { calls: string[] }) => api.calls.filter((call) => !call.startsWith('GET '))

/** Answers the next dialog (dismiss = stay, accept = leave) and resolves with what it said. */
function answerNextDialog(page: Page, leave: boolean) {
  return new Promise<{ type: string; message: string }>((resolve) => {
    page.once('dialog', async (dialog) => {
      resolve({ type: dialog.type(), message: dialog.message() })
      await (leave ? dialog.accept() : dialog.dismiss())
    })
  })
}

const NOW = {
  title: 'Opening hours',
  blocks: [hero('Open all day')],
  seoDescription: 'Open all day',
}
const THEN = {
  title: 'Opening hours (old)',
  blocks: [hero('Open mornings')],
  seoDescription: 'Open mornings',
}

test('[UC-VH-32] Restore puts the old version into the editor as unsaved changes, says so, and writes nothing', async ({
  page,
}) => {
  const { item, content } = await setup(page, NOW, [
    fakeVersion(2, NOW),
    fakeVersion(1, { ...THEN, savedBy: { id: 'a', name: 'Maya Moss' } }),
  ])

  // The way a person gets there: look at the old version, then press Restore.
  await page.goto(`/pages/${item.id}/versions`)
  await page
    .getByRole('list', { name: 'Saved versions' })
    .getByRole('button', { name: /1 Oct, 09:01/ })
    .click()
  await page.getByRole('link', { name: 'Restore this version' }).click()

  await expect(page).toHaveURL(new RegExp(`/pages/${item.id}$`)) // no `restore=` left
  await expect(titleBox(page)).toHaveValue(THEN.title)
  await expect(card(page, '1. Hero').getByLabel('Headline')).toHaveValue('Open mornings')
  await expect(page.getByLabel('Meta description')).toHaveValue('Open mornings')
  await expect(page.getByText('You have unsaved changes.')).toBeVisible()
  await expect(saveButton(page)).toBeEnabled()
  await expect(notice(page)).toHaveText(
    'The version from 1 Oct, 09:01 is loaded. Nothing changes until you press Save.',
  )

  // The page itself is as it was: its address and status, and nothing was written.
  const facts = page.locator('.facts')
  await expect(facts.getByText('/opening-hours')).toBeVisible()
  await expect(facts).toContainText('Draft')
  expect(writes(content)).toEqual([])
  expect(content.saved).toEqual([])
})

test('[UC-VH-32] the address alone does the same, and a reload afterwards shows the page as it was saved', async ({
  page,
}) => {
  const { item, content } = await setup(page, NOW, [fakeVersion(2, NOW), fakeVersion(1, THEN)])

  await page.goto(`/pages/${item.id}?restore=${fakeVersion(1).id}`)
  await expect(titleBox(page)).toHaveValue(THEN.title)
  await expect(page).toHaveURL(new RegExp(`/pages/${item.id}$`))

  // The parameter is gone, so opening the same address again (a reload) does not restore again; the
  // unsaved text is let go, whatever the browser asks about that.
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto(page.url())
  await expect(titleBox(page)).toHaveValue('Opening hours')
  await expect(page.getByText('No unsaved changes.')).toBeVisible()
  expect(writes(content)).toEqual([])
})

test('[UC-VH-33] saving a restore sends only what differs from the saved page, and the screen says Saved', async ({
  page,
}) => {
  // The search description is the same in both, so it is not sent.
  const { item, content } = await setup(page, NOW, [
    fakeVersion(2, NOW),
    fakeVersion(1, { ...THEN, seoDescription: NOW.seoDescription }),
  ])

  await page.goto(`/pages/${item.id}?restore=${fakeVersion(1).id}`)
  await expect(titleBox(page)).toHaveValue(THEN.title)
  await saveButton(page).click()

  await expect(page.getByText('Saved.')).toBeVisible()
  expect(content.saved).toEqual([{ title: THEN.title, blocks: THEN.blocks }])
  await expect(page.getByText('No unsaved changes.')).toBeVisible()
})

test('[UC-VH-34] leaving a restored page without saving asks first, and changes nothing', async ({
  page,
}) => {
  const versions = [fakeVersion(2, NOW), fakeVersion(1, THEN)]
  const { item, content, versionApi } = await setup(page, NOW, versions)
  await page.goto(`/pages/${item.id}?restore=${fakeVersion(1).id}`)
  await expect(titleBox(page)).toHaveValue(THEN.title)

  // The Versions link: stay, and the restored text is still there.
  let asked = answerNextDialog(page, false)
  await page.getByRole('link', { name: 'Versions', exact: true }).click()
  expect((await asked).message).toBe(LEAVE)
  await expect(page).toHaveURL(new RegExp(`/pages/${item.id}$`))
  await expect(titleBox(page)).toHaveValue(THEN.title)

  // A link to Pages: asks too, and this time leave.
  asked = answerNextDialog(page, true)
  await page.getByRole('link', { name: '← Pages' }).click()
  expect((await asked).message).toBe(LEAVE)
  await expect(page.getByRole('heading', { level: 1, name: 'Pages' })).toBeVisible()

  // The page opens as it was saved, and the versions are as they were.
  await page.goto(`/pages/${item.id}`)
  await expect(titleBox(page)).toHaveValue('Opening hours')
  await expect(page.getByText('No unsaved changes.')).toBeVisible()
  expect(writes(content)).toEqual([])
  expect(versionApi.byPage[item.id]).toEqual(versions)
})

test('[UC-VH-35] restoring the version the page already has changes nothing, and says so', async ({
  page,
}) => {
  // Versions 3 and 1 are word for word the page as it is now (a restore was saved after version 2).
  const { item } = await setup(page, NOW, [
    fakeVersion(3, NOW),
    fakeVersion(2, THEN),
    fakeVersion(1, NOW),
  ])

  await page.goto(`/pages/${item.id}?restore=${fakeVersion(1).id}`)

  await expect(notice(page)).toHaveText('That is the version this page has now.')
  await expect(titleBox(page)).toHaveValue('Opening hours')
  await expect(page.getByText('No unsaved changes.')).toBeVisible()
  await expect(saveButton(page)).toBeDisabled()
  await expect(page).toHaveURL(new RegExp(`/pages/${item.id}$`))
})

for (const [what, answer] of [
  ['a version that is not there (404)', 'missing'],
  ['a failing request (500)', 'server'],
  ['no connection', 'offline'],
] as const) {
  test(`[UC-VH-37] ${what}: the page opens as last saved, nothing changes, and the screen says so`, async ({
    page,
  }) => {
    const { item, versionApi, content } = await setup(page, NOW, [
      fakeVersion(2, NOW),
      fakeVersion(1, THEN),
    ])
    const wanted = answer === 'missing' ? fakeVersion(99).id : fakeVersion(1).id
    versionApi.override = async (route) => {
      if (answer === 'server') void fulfill(route, 500, { message: 'Internal server error' })
      else if (answer === 'offline') await route.abort('connectionrefused')
      else return false
      return true
    }

    await page.goto(`/pages/${item.id}?restore=${wanted}`)

    await expect(notice(page)).toHaveText("Couldn't load that version. The page is as last saved.")
    await expect(titleBox(page)).toHaveValue('Opening hours')
    await expect(page.getByLabel('Meta description')).toHaveValue('Open all day')
    await expect(page.getByText('No unsaved changes.')).toBeVisible()
    await expect(saveButton(page)).toBeDisabled()
    await expect(page).toHaveURL(new RegExp(`/pages/${item.id}$`))
    expect(writes(content)).toEqual([])
  })
}

test('[UC-VH-31] a block the site cannot draw and a block the editor does not know: the first is left out of the preview with the usual note, and both are in the editor exactly as stored', async ({
  page,
}) => {
  const empty = { type: 'hero', headline: '' }
  const unknown = { type: 'hologram', note: 'from the future', depth: 3 }
  const odd = fakeVersion(1, { title: 'Odd blocks', blocks: [empty, unknown] })
  const saved = { title: NOW.title, blocks: NOW.blocks }
  const { item, content } = await setup(page, saved, [fakeVersion(2, saved), odd])

  // Shown on the Versions screen: the one the site cannot draw is left out of the drawing, with the
  // edit screen's own note; the unknown one is not counted, as there.
  await page.goto(`/pages/${item.id}/versions`)
  await page
    .getByRole('list', { name: 'Saved versions' })
    .getByRole('button', { name: /1 Oct, 09:01/ })
    .click()
  await expect(
    page.getByText(
      '1 block is not shown: the site leaves out a block until its required fields are filled.',
    ),
  ).toBeVisible()

  // Restored: both are in the editor as they were stored.
  await page.getByRole('link', { name: 'Restore this version' }).click()
  await expect(titleBox(page)).toHaveValue('Odd blocks')
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['1. Hero', '2. Unknown block'])
  await expect(card(page, '1. Hero').getByLabel('Headline')).toHaveValue('')
  await expect(
    card(page, '2. Unknown block').getByText('This block cannot be edited here.'),
  ).toBeVisible()

  // The unknown block is saved exactly as it was; the empty one is held to the editor's usual rule:
  // it asks for its text, and nothing is sent until it has it.
  await saveButton(page).click()
  await expect(card(page, '1. Hero').getByLabel('Headline')).toHaveAccessibleDescription(
    'Enter the headline.',
  )
  expect(content.saved).toEqual([])
  await card(page, '1. Hero').getByLabel('Headline').fill('Filled in')
  await saveButton(page).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(content.saved).toEqual([
    { title: 'Odd blocks', blocks: [{ type: 'hero', headline: 'Filled in' }, unknown] },
  ])
})

test('[UC-VH-41] a notice carried in the address and a restore never show together, and the page opens as before without one', async ({
  page,
}) => {
  const { item } = await setup(page, NOW, [fakeVersion(2, NOW), fakeVersion(1, THEN)])
  // A page just created arrives with its notice carried in the address (the router's own state).
  await page.addInitScript(() =>
    history.replaceState({ usr: { created: true }, key: 'created', idx: 0 }, ''),
  )

  await page.goto(`/pages/${item.id}`)
  await expect(titleBox(page)).toHaveValue('Opening hours')
  await expect(notice(page)).toHaveText('Page created.')

  // The same, with a restore asked for as well: only the restore's notice shows.
  await page.goto(`/pages/${item.id}?restore=${fakeVersion(1).id}`)
  await expect(titleBox(page)).toHaveValue(THEN.title)
  await expect(notice(page)).toHaveCount(1)
  await expect(notice(page)).toContainText('is loaded. Nothing changes until you press Save.')
  await expect(page.getByText('Page created.')).toHaveCount(0)
})
