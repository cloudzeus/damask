import 'dotenv/config'
import { test, expect, type Page } from '@playwright/test'
import { prisma } from '../src/lib/prisma'

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

test.afterAll(async () => {
  // καθαρισμός του test gtagId ώστε να μη μείνει fake τιμή στη (dev) DB μετά το suite.
  await prisma.setting.deleteMany({ where: { key: 'integration.gtags' } })
  await prisma.$disconnect()
})

test('SUPER_ADMIN βλέπει το /settings με τα 3 tabs — Εταιρεία ενεργό από προεπιλογή', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: 'Ρυθμίσεις' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Εταιρεία' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Διασυνδέσεις' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'SEO & Analytics' })).toBeVisible()

  await expect(page.getByRole('tab', { name: 'Εταιρεία' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Στοιχεία εταιρείας' })).toBeVisible()
})

test('η καρτέλα Διασυνδέσεις δείχνει και τις 7 κάρτες integrations', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/settings')

  await page.getByRole('tab', { name: 'Διασυνδέσεις' }).click()
  await expect(page.getByRole('tab', { name: 'Διασυνδέσεις' })).toHaveAttribute('aria-selected', 'true')

  await expect(page.getByRole('heading', { name: 'SoftOne ERP' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mailgun' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'BunnyCDN' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'DeepSeek' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Claude API' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Google Tags' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Facebook' })).toBeVisible()
})

test('η καρτέλα SEO & Analytics δείχνει τη φόρμα προεπιλογών', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/settings')

  await page.getByRole('tab', { name: 'SEO & Analytics' }).click()
  await expect(page.getByRole('tab', { name: 'SEO & Analytics' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'SEO & Analytics προεπιλογές' })).toBeVisible()
})

test('αποθήκευση Google Tags gtagId → toast + persist μετά από reload (χωρίς πραγματικό external call)', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Διασυνδέσεις' }).click()

  const card = page.locator('.glass').filter({ has: page.getByRole('heading', { name: 'Google Tags' }) })
  await card.locator('#gtags-gtag').fill('G-E2ETEST99')
  await card.getByRole('button', { name: 'Αποθήκευση' }).click()

  await expect(page.getByText('Οι ρυθμίσεις Google Tags αποθηκεύτηκαν.')).toBeVisible()
  await expect(card.getByText('Ρυθμισμένο', { exact: true })).toBeVisible()

  await page.reload()
  await page.getByRole('tab', { name: 'Διασυνδέσεις' }).click()
  await expect(page.locator('#gtags-gtag')).toHaveValue('G-E2ETEST99')
})
