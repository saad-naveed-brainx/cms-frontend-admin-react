import { expect, test } from '@playwright/test'

const widths = [375, 768, 1280]

for (const width of widths) {
  test(`the admin home looks as approved at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Admin panel' })).toBeVisible()

    // The API address differs per slot (its port), so it is masked out of the comparison.
    await expect(page).toHaveScreenshot(`admin-home-${width}.png`, {
      fullPage: true,
      mask: [page.getByText(/^API:/)],
    })
  })
}
