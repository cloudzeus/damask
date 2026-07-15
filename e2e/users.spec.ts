import 'dotenv/config'
import { test, expect, type Page } from '@playwright/test'
import { prisma } from '../src/lib/prisma'

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

// ── «+ Νέος χρήστης» dialog: δημιουργία + επεξεργασία ─────────────────────

const RUN_ID = Date.now()
const TEST_NAME = `E2E Χρήστης ${RUN_ID}`
const TEST_EMAIL = `e2e-user-${RUN_ID}@damask.gr`

test.afterAll(async () => {
  // cleanup: δεν υπάρχει delete στο UI (εκτός σκοπής του CRUD που ζητήθηκε) —
  // καθαρισμός με prisma direct, όπως προβλέπεται στο teardown του spec.
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } })
  await prisma.$disconnect()
})

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

test('δημιουργία χρήστη μέσα από το dialog, μετά επεξεργασία στοιχείων', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/users')

  // ── 1) Δημιουργία ────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Νέος χρήστης' }).click()

  const createDialog = page.getByRole('dialog')
  await expect(createDialog.getByText('Νέος χρήστης')).toBeVisible()

  await page.fill('#user-form-name', TEST_NAME)
  await page.fill('#user-form-email', TEST_EMAIL)

  await page.getByRole('combobox', { name: 'Ρόλος' }).click()
  await page.getByRole('option', { name: 'SALESMAN', exact: true }).click()

  await page.fill('#user-form-password', 'TestPass123!')
  await page.fill('#user-form-city', 'Αθήνα')

  await createDialog.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText(`Ο χρήστης ${TEST_NAME} δημιουργήθηκε.`)).toBeVisible()

  const row = page.getByRole('row', { name: TEST_NAME })
  await expect(row).toBeVisible()
  await expect(row.getByText('Αθήνα')).toBeVisible()
  await expect(row.getByText('SALESMAN')).toBeVisible()

  // ── 2) Επεξεργασία — αλλαγή πόλης, φαίνεται στη λίστα ─────────────────
  await row.getByRole('button', { name: /Ενέργειες/ }).click()
  await page.getByRole('menuitem', { name: 'Επεξεργασία' }).click()

  const editDialog = page.getByRole('dialog')
  await expect(editDialog.getByText(`Επεξεργασία — ${TEST_NAME}`)).toBeVisible()

  const cityInput = page.locator('#user-form-city')
  await cityInput.fill('')
  await cityInput.fill('Θεσσαλονίκη')

  await editDialog.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText(`Οι αλλαγές για ${TEST_NAME} αποθηκεύτηκαν.`)).toBeVisible()

  await expect(row.getByText('Θεσσαλονίκη')).toBeVisible()
})
