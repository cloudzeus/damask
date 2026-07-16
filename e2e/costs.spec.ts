import { test, expect } from '@playwright/test'

test('SUPER_ADMIN sees the /costs page with KPIs and the SUPER_ADMIN-only markup card', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/costs')
  await expect(page.getByRole('heading', { name: 'Κόστη AI' })).toBeVisible()

  // KPI cards
  await expect(page.getByText('Συνολικό κόστος περιόδου')).toBeVisible()
  await expect(page.getByText('Tokens σύνολο')).toBeVisible()

  // SUPER_ADMIN-only cards — markup per service + pricing overrides.
  await expect(page.getByText('Markup ανά υπηρεσία')).toBeVisible()
  await expect(page.getByText('Overrides τιμολόγησης μοντέλων')).toBeVisible()
  await expect(page.getByLabel('DeepSeek markup %')).toBeVisible()

  // Role-based grouped-table columns — SUPER_ADMIN sees the base/markup breakdown.
  await expect(page.getByRole('columnheader', { name: 'Κόστος βάσης $' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Markup %' })).toBeVisible()

  // Δεύτερο tab «Αναλυτικά».
  await page.getByRole('tab', { name: 'Αναλυτικά' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Αναλυτικά' })).toBeVisible()
})

test('sidebar shows the «Κόστη AI» nav item for SUPER_ADMIN and links to /costs', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)

  await page.locator('aside').getByRole('link', { name: 'Κόστη AI' }).click()
  await expect(page).toHaveURL(/\/costs/)
})
