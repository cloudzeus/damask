import { test, expect } from '@playwright/test'

test('admin sees the roles page with the permissions matrix', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/roles')
  await expect(page.getByRole('heading', { name: 'Ρόλοι & Δικαιώματα' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByText('product.view')).toBeVisible()
})
