import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { admin } from './tenants.ts'
import { openSite, realApi, signInThroughTheScreen, unique } from './support.ts'

/**
 * Saving and leaving on the REAL flow (feature save-bar): Save stays in view at the bottom of the
 * edit screen however long the page, the Publish box says why Preview and Publish wait, and leaving
 * with unsaved changes asks first, however the person leaves. Real browser, admin, API and database.
 */

const ORCHARD = 'Orchard Bakery'
const MAPLE = 'Maple Books'
const LEAVE = 'You have unsaved changes. Leave without saving them?'

/** Eight sections, so the search box sits far below the top of the screen. */
const LONG = Array.from({ length: 8 }, (_, at) => ({ type: 'hero', headline: `Section ${at + 1}` }))

/** Answers the next dialog (dismiss = stay, accept = leave) and resolves with what it said. */
function answerNextDialog(page: Page, leave: boolean) {
  return new Promise<{ type: string; message: string }>((resolve) => {
    page.once('dialog', async (dialog) => {
      resolve({ type: dialog.type(), message: dialog.message() })
      await (leave ? dialog.accept() : dialog.dismiss())
    })
  })
}

test('[UC-SB-01] on a long page Save stays in view at the bottom of the screen, says what is unsaved, and the Publish box says why Preview and Publish wait', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  const made = await api.createPage({
    type: 'page',
    title: `Long ${token}`,
    slug: `long-${token}`,
    blocks: LONG,
  })
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)

  const save = page.getByRole('button', { name: 'Save' })
  await expect(page.getByText('No unsaved changes.')).toBeVisible()
  await expect(save).toBeDisabled()

  const seoTitle = page.getByLabel('SEO title')
  await seoTitle.scrollIntoViewIfNeeded()
  await seoTitle.fill(`Long read ${token}`)
  // Typing at the bottom of a long page: Save is on screen without scrolling back up.
  await expect(save).toBeInViewport()
  await expect(save).toBeEnabled()
  await expect(page.getByText('You have unsaved changes.')).toBeInViewport()
  await expect(
    page.getByText('Save your changes first. Preview and Publish use the saved page.'),
  ).toBeAttached()

  await save.click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await expect(page.getByText('No unsaved changes.')).toBeVisible()
  await expect(save).toBeDisabled()
  await expect(page.getByText('Save your changes first.')).toHaveCount(0)
  expect((await api.getPage(made.id)).body.seoTitle).toBe(`Long read ${token}`)
})

test('[UC-SB-02] leaving with unsaved changes asks first, by a link, Back, or closing the tab; staying keeps them, leaving loses them; once saved nothing asks', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const token = unique()
  const made = await api.createPage({
    type: 'page',
    title: `Leave ${token}`,
    slug: `leave-${token}`,
  })
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto('/pages')
  await page.getByRole('link', { name: `Leave ${token}` }).click()
  await expect(page).toHaveURL(`/pages/${made.id}`)

  const seoTitle = page.getByLabel('SEO title')
  await seoTitle.fill('Not saved yet')

  // A link: stay, and the typing is still there.
  let asked = answerNextDialog(page, false)
  await page.getByRole('link', { name: '← Pages' }).click()
  expect(await asked).toEqual({ type: 'confirm', message: LEAVE })
  await expect(page).toHaveURL(`/pages/${made.id}`)
  await expect(seoTitle).toHaveValue('Not saved yet')

  // The browser's Back: stay.
  asked = answerNextDialog(page, false)
  await page.evaluate(() => history.back())
  expect(await asked).toEqual({ type: 'confirm', message: LEAVE })
  await expect(page).toHaveURL(`/pages/${made.id}`)
  await expect(seoTitle).toHaveValue('Not saved yet')

  // Closing the tab or reloading: the browser asks in its own words.
  asked = answerNextDialog(page, false)
  await page.close({ runBeforeUnload: true })
  expect((await asked).type).toBe('beforeunload')
  expect(page.isClosed()).toBe(false)
  await expect(seoTitle).toHaveValue('Not saved yet')

  // A link again, and leave: the change is gone, never saved.
  asked = answerNextDialog(page, true)
  await page.getByRole('link', { name: '← Pages' }).click()
  await asked
  await expect(page.getByRole('heading', { level: 1, name: 'Pages' })).toBeVisible()
  expect((await api.getPage(made.id)).body.seoTitle).toBeNull()

  // Saved: leaving asks nothing.
  await page.getByRole('link', { name: `Leave ${token}` }).click()
  await seoTitle.fill('Saved this time')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  page.once('dialog', (dialog) => {
    throw new Error(`nothing should ask, but "${dialog.message()}" did`)
  })
  await page.getByRole('link', { name: '← Pages' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Pages' })).toBeVisible()
})

test('[UC-SB-03] switching site or signing out with unsaved changes asks first, and staying keeps the site, the person and the typing', async ({
  page,
  request,
}) => {
  const api = await realApi(request, admin, ORCHARD)
  const maple = await realApi(request, admin, MAPLE)
  const token = unique()
  const made = await api.createPage({
    type: 'page',
    title: `Switch ${token}`,
    slug: `switch-${token}`,
  })
  await signInThroughTheScreen(page)
  await openSite(page, api.siteId)
  await page.goto(`/pages/${made.id}`)
  await page.getByLabel('Meta description').fill('Typed, not saved')

  const switcher = page.getByLabel('Site')
  let asked = answerNextDialog(page, false)
  await switcher.selectOption(maple.siteId)
  expect(await asked).toEqual({ type: 'confirm', message: LEAVE })
  await expect(switcher).toHaveValue(api.siteId)
  await expect(page).toHaveURL(`/pages/${made.id}`)
  await expect(page.getByLabel('Meta description')).toHaveValue('Typed, not saved')

  asked = answerNextDialog(page, false)
  await page.getByRole('button', { name: 'Sign out' }).click()
  expect(await asked).toEqual({ type: 'confirm', message: LEAVE })
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByLabel('Meta description')).toHaveValue('Typed, not saved')

  // Leave for the other site: asked once, and the other site's pages show.
  asked = answerNextDialog(page, true)
  await switcher.selectOption(maple.siteId)
  await asked
  await expect(page).toHaveURL('/pages')
  await expect(switcher).toHaveValue(maple.siteId)
  expect((await api.getPage(made.id)).body.seoDescription).toBeNull()
})
