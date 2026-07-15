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

test.beforeEach(async () => {
  // Βεβαιώσου ότι το Viva ΔΕΝ είναι ρυθμισμένο πριν από κάθε test σε αυτό το
  // suite — το «friendly error» test παρακάτω βασίζεται σε αυτό, και δεν
  // πρέπει ποτέ να κάνει πραγματική κλήση προς τη Viva.
  await prisma.setting.deleteMany({ where: { key: 'integration.viva' } })
})

test.afterAll(async () => {
  await prisma.setting.deleteMany({ where: { key: 'integration.viva' } })
  await prisma.$disconnect()
})

test('SUPER_ADMIN βλέπει τη σελίδα /payments με KPIs, κουμπί «Νέα πληρωμή» και πίνακα', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/payments')

  await expect(page.getByRole('heading', { name: 'Πληρωμές' })).toBeVisible()
  // exact:true — «Σε αναμονή» εμφανίζεται ΚΑΙ ως substring μέσα στο hint της κάρτας «Ληγμένες»
  // («> 30′ σε αναμονή»), το getByText χωρίς exact θα έπιανε strict-mode violation (2 matches).
  await expect(page.getByText('Σε αναμονή', { exact: true })).toBeVisible()
  await expect(page.getByText('Πληρωμένες (μήνας)', { exact: true })).toBeVisible()
  await expect(page.getByText('Ληγμένες', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Νέα πληρωμή' })).toBeVisible()
})

test('το «Πληρωμές» εμφανίζεται στο sidebar (permission payment.view) και οδηγεί στη σελίδα', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/dashboard')
  const navLink = page.locator('aside').getByRole('link', { name: 'Πληρωμές' })
  await expect(navLink).toBeVisible()
  await navLink.click()
  await expect(page).toHaveURL(/\/payments/)
})

test('«Νέα πληρωμή» χωρίς ρυθμισμένο Viva δείχνει φιλικό μήνυμα να ρυθμίσει το Viva — όχι πραγματική κλήση Viva', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/payments')

  await page.getByRole('button', { name: 'Νέα πληρωμή' }).click()
  await expect(page.getByRole('heading', { name: 'Νέα πληρωμή' })).toBeVisible()

  await page.fill('#np-amount', '49,90')
  await page.fill('#np-description', 'Δοκιμαστική πληρωμή e2e')
  await page.getByRole('button', { name: 'Δημιουργία πληρωμής' }).click()

  await expect(page.getByText('Ρύθμισε το Viva στις Ρυθμίσεις')).toBeVisible()

  // Καμία εγγραφή PaymentOrder δεν πρέπει να έχει δημιουργηθεί — το σφάλμα ρύθμισης
  // σκάει πριν φτάσουμε καν σε πραγματική κλήση προς τη Viva.
  const count = await prisma.paymentOrder.count({ where: { description: 'Δοκιμαστική πληρωμή e2e' } })
  expect(count).toBe(0)
})

test('η κάρτα ρυθμίσεων Viva Payments εμφανίζεται στην καρτέλα Διασυνδέσεις με environment switch', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Διασυνδέσεις' }).click()

  const card = page.locator('.glass').filter({ has: page.getByRole('heading', { name: 'Viva Payments' }) })
  await expect(card).toBeVisible()
  await expect(card.getByText('Demo', { exact: true }).first()).toBeVisible()
  await expect(card.getByText('Παραγωγή', { exact: true }).first()).toBeVisible()
  await expect(card.locator('#viva-demo-clientId')).toBeVisible()
  await expect(card.locator('#viva-prod-clientId')).toBeVisible()
})
