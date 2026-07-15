import { test, expect } from '@playwright/test'

test('admin sees the users management page with the users table', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/users')
  await expect(page.getByRole('heading', { name: 'Χρήστες' })).toBeVisible()
  const table = page.getByRole('table')
  await expect(table).toBeVisible()
  await expect(table.getByText('Giannis Kozyris')).toBeVisible()
})
