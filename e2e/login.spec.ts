import { test, expect } from '@playwright/test'

test('anonymous sees the public homepage at /', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Η ύλη γίνεται ατμόσφαιρα.' })).toBeVisible()
})

test('redirects anonymous /dashboard to /login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})

test('logs in and sees dashboard, then dropdown shows role', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.locator('aside').getByText('DAMASK', { exact: true })).toBeVisible()
})

test('rejects wrong password', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', 'wrong-password')
  await page.click('button[type=submit]')
  await expect(page.getByText('Λάθος email ή κωδικός.')).toBeVisible()
})
