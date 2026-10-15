import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  SAMPLE_PNG,
  fakeContent,
  fakeMedia,
  fakeMediaItem,
  fulfill,
  signedInAs,
} from './support/mock-api.ts'

/**
 * The Media screen (feature media, D-042) with the API's answers given here, for what the real API
 * cannot be made to do on demand (a refusal, a large library). The real flow is in
 * e2e/flow/media.spec.ts.
 */

const UPLOADER = ['content.create', 'content.edit_any', 'media.upload']
const grid = (page: Page) => page.getByRole('list', { name: 'Pictures' })
const picker = (page: Page) => page.getByLabel('Add New Media File')

async function openMedia(
  page: Page,
  permissions: string[],
  items = [] as ReturnType<typeof fakeMediaItem>[],
) {
  await signedInAs(page, permissions)
  await fakeContent(page, [])
  const api = await fakeMedia(page, items)
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Media' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Media Library' })).toBeVisible()
  return api
}

test('[UC-MD-05] pictures are added from the Media screen and appear first in the grid; a file that cannot be added is explained and not sent', async ({
  page,
}) => {
  const api = await openMedia(page, UPLOADER)
  await expect(page.getByText('No pictures yet. Add one with Add New Media File.')).toBeVisible()

  await picker(page).setInputFiles({
    name: 'shop front.png',
    mimeType: 'image/png',
    buffer: SAMPLE_PNG,
  })
  await expect(page.getByRole('status').filter({ hasText: 'was added' })).toHaveText(
    'shop front.png was added.',
  )
  await expect(grid(page).getByRole('listitem')).toHaveCount(1)
  await expect(grid(page).getByRole('img', { name: 'shop front.png' })).toBeVisible()
  await expect(grid(page).getByRole('listitem').first()).toContainText('1600 × 1067 · 1 KB')
  expect(api.uploads).toEqual(['shop front.png'])

  // Two at once: both sent, newest first. A PDF and a picture over 10 MB are explained and never sent.
  await picker(page).setInputFiles([
    { name: 'menu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
    { name: 'cake.png', mimeType: 'image/png', buffer: SAMPLE_PNG },
    { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
    { name: 'bread.png', mimeType: 'image/png', buffer: SAMPLE_PNG },
  ])
  await expect(page.getByRole('status').filter({ hasText: 'were added' })).toHaveText(
    '2 pictures were added.',
  )
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('menu.pdf: only JPEG, PNG and WebP pictures can be added.')
  await expect(alert).toContainText('huge.jpg is larger than 10 MB.')
  expect(api.uploads).toEqual(['shop front.png', 'cake.png', 'bread.png'])
  await expect(grid(page).locator('.media-name')).toHaveText([
    'bread.png',
    'cake.png',
    'shop front.png',
  ])
  await expect(page.getByText('3 pictures, newest first.')).toBeVisible()

  // The API's own refusal is said with the file's name.
  api.override = (route, request) => {
    if (request.method() !== 'POST') return false
    void fulfill(route, 400, {
      statusCode: 400,
      message:
        'This file is not a picture that can be used: upload a JPEG, PNG or WebP of at most 50 megapixels',
    })
    return true
  }
  await picker(page).setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('nope'),
  })
  await expect(page.getByRole('alert')).toHaveText(
    'fake.png: This file is not a picture that can be used: upload a JPEG, PNG or WebP of at most 50 megapixels.',
  )
  await expect(grid(page).getByRole('listitem')).toHaveCount(3)
})

test('[UC-MD-05] a large library shows forty at a time; someone without media.upload sees the pictures but no way to add one', async ({
  page,
}) => {
  const many = Array.from({ length: 45 }, (_, index) => fakeMediaItem(45 - index))
  await openMedia(page, ['content.create'], many)

  await expect(picker(page)).toHaveCount(0)
  await expect(page.getByText('JPEG, PNG or WebP, up to 10 MB each.')).toHaveCount(0)
  await expect(grid(page).getByRole('listitem')).toHaveCount(40)
  await expect(page.getByText('45 pictures, newest first.')).toBeVisible()
  await page.getByRole('button', { name: 'Show more pictures' }).click()
  await expect(grid(page).getByRole('listitem')).toHaveCount(45)
  await expect(page.getByRole('button', { name: 'Show more pictures' })).toHaveCount(0)
  await expect(grid(page).locator('.media-name').last()).toHaveText('picture-1.png')
})

test('[UC-MD-05] when the library cannot be loaded it says so and can try again', async ({
  page,
}) => {
  await signedInAs(page, UPLOADER)
  await fakeContent(page, [])
  const api = await fakeMedia(page, [fakeMediaItem(1)])
  let fail = true
  api.override = (route, request) => {
    if (request.method() !== 'GET' || !fail) return false
    void fulfill(route, 500, { message: 'Internal server error' })
    return true
  }
  await page.goto('/media')
  await expect(page.getByRole('alert')).toContainText('Couldn’t load the pictures.')
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(grid(page).getByRole('listitem')).toHaveCount(1)
})
