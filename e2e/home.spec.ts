import { expect, test } from '@playwright/test'

test('the admin panel opens and shows which API it talks to', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Admin panel', level: 1 })).toBeVisible()
  await expect(page.getByText(/^API: https?:\/\/[\w.-]+:\d+/)).toBeVisible()
  await expect(page.getByText('API: not configured')).toHaveCount(0)
})
