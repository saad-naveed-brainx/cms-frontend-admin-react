import { expect, test } from '@playwright/test'
import { fakeContent, fakeMedia, fakeMediaItem, signedInAs } from '../support/mock-api.ts'

/**
 * Screenshots of the Media Library (feature media, D-042) against the approved baselines. The
 * API's answers are replaced, with the same pictures every time (each one the same small PNG).
 */

const UPLOADER = ['content.create', 'content.edit_any', 'media.upload']

for (const width of [375, 1280]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('[UC-MD-05] the media library looks as approved', async ({ page }) => {
      await signedInAs(page, UPLOADER)
      await fakeContent(page, [])
      await fakeMedia(
        page,
        Array.from({ length: 7 }, (_, index) =>
          fakeMediaItem(7 - index, {
            filename: ['shop-front.jpg', 'sourdough.png', 'team photo at the bakery.jpg'][
              index % 3
            ],
          }),
        ),
      )
      await page.goto('/media')
      const grid = page.getByRole('list', { name: 'Pictures' })
      await expect(grid.getByRole('listitem')).toHaveCount(7)
      // Every small copy has loaded before the picture is taken.
      await expect
        .poll(() =>
          grid
            .getByRole('img')
            .evaluateAll((images) =>
              images.every((img) => (img as HTMLImageElement).naturalWidth > 0),
            ),
        )
        .toBe(true)
      await expect(page).toHaveScreenshot(`media-${width}.png`, { fullPage: true })
    })
  })
}
