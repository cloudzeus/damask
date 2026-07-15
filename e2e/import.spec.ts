import 'dotenv/config'
import { test, expect } from '@playwright/test'
import * as XLSX from 'xlsx'
import { prisma } from '../src/lib/prisma'

/**
 * Πραγματικό μικρό xlsx φτιαγμένο μέσα στο spec (xlsx lib, Node) — 2 φύλλα, το
 * 2ο ("Προϊόντα") έχει 5 γραμμές προϊόντων + μία στήλη «Παρατηρήσεις» που το
 * test θα εξαιρέσει. Το 1ο φύλλο είναι σκόπιμα ασύνδετο με προϊόντα, ώστε το
 * test να αποδεικνύει ότι η επιλογή ΣΥΓΚΕΚΡΙΜΕΝΟΥ φύλλου δουλεύει πραγματικά
 * (αν ο οδηγός εισήγαγε λάθος φύλλο, ο Έλεγχος δεν θα έδειχνε 5 δημιουργίες).
 */
const RUN_ID = Date.now()
const CODES = Array.from({ length: 5 }, (_, i) => `E2E-IMP-${RUN_ID}-${i + 1}`)

function buildTestWorkbook(): Buffer {
  const wb = XLSX.utils.book_new()

  const decoy = XLSX.utils.aoa_to_sheet([['Δεν είναι προϊόντα — φύλλο διακίνησης']])
  XLSX.utils.book_append_sheet(wb, decoy, 'Σημειώσεις')

  const header = ['Κωδικός', 'Περιγραφή', 'Τιμή Λιανικής', 'Παρατηρήσεις']
  const rows = CODES.map((code, i) => [
    code,
    `Δοκιμαστικό Προϊόν ${i + 1}`,
    (10 + i).toFixed(2).replace('.', ','),
    'αγνόησέ με — δεν αντιστοιχίζεται',
  ])
  const productSheet = XLSX.utils.aoa_to_sheet([header, ...rows])
  XLSX.utils.book_append_sheet(wb, productSheet, 'Προϊόντα')

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

test.afterAll(async () => {
  // Καθαρισμός μόνο των imported προϊόντων — το ImportJob παραμένει σκόπιμα (ιστορικό
  // εισαγωγών, ίδια λογική με το SyncLog· δεν είναι test pollution αλλά αναμενόμενη εγγραφή).
  await prisma.product.deleteMany({ where: { code: { in: CODES } } })
  await prisma.$disconnect()
})

test('εισαγωγή Excel: επιλογή φύλλου, εξαίρεση στήλης, αντιστοίχιση, έλεγχος, εκτέλεση', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/import')
  await expect(page.getByRole('heading', { name: 'Εισαγωγή Excel' })).toBeVisible()

  // ── Βήμα 1 — Αρχείο ──────────────────────────────────────────────────────
  const buffer = buildTestWorkbook()
  await page.locator('input[type=file]').setInputFiles({
    name: `e2e-import-${RUN_ID}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  })
  await expect(page.getByText(`e2e-import-${RUN_ID}.xlsx`)).toBeVisible()
  await page.getByRole('button', { name: 'Επόμενο →' }).click()

  // ── Βήμα 2 — Φύλλο & Στήλες: επιλογή του 2ου φύλλου "Προϊόντα" ──────────
  await expect(page.getByRole('heading', { name: 'Φύλλο & Στήλες' })).toBeVisible()
  await page.getByRole('button', { name: /Προϊόντα/ }).click()
  await expect(page.getByText('Κωδικός').first()).toBeVisible()

  // Εξαίρεση της 4ης στήλης (Παρατηρήσεις / D) — κλικ στο checkbox/γράμμα της στο header row.
  await page.locator('table thead th button').nth(3).click()

  await page.getByRole('button', { name: 'Επόμενο →' }).click()

  // ── Βήμα 3 — Αντιστοίχιση: code/name/τιμή πρέπει να αντιστοιχίζονται αυτόματα ──
  await expect(page.getByRole('heading', { name: 'Αντιστοίχιση στηλών' })).toBeVisible()
  await expect(page.getByText('3 από 3 στήλες αντιστοιχισμένες')).toBeVisible()
  await expect(page.getByText('100%')).toBeVisible()

  await page.getByRole('button', { name: 'Επόμενο →' }).click()

  // ── Βήμα 4 — Έλεγχος: πρέπει να δείξει 5 δημιουργίες, καμία ενημέρωση/σφάλμα ──
  await expect(page.getByRole('heading', { name: 'Έλεγχος' })).toBeVisible()
  const createCard = page.locator('div.text-center', { hasText: 'Θα δημιουργηθούν' })
  await expect(createCard).toContainText('5', { timeout: 15_000 })
  const updateCard = page.locator('div.text-center', { hasText: 'Θα ενημερωθούν' })
  await expect(updateCard).toContainText('0')
  const errorCard = page.locator('div.text-center', { hasText: 'Σφάλματα' })
  await expect(errorCard).toContainText('0')

  await page.getByRole('button', { name: 'Συνέχεια στην Εκτέλεση →' }).click()

  // ── Βήμα 5 — Εκτέλεση: sync (5 γραμμές ≤ 500) → σύνοψη άμεσα ─────────────
  await expect(page.getByRole('heading', { name: 'Εκτέλεση' })).toBeVisible()
  await page.getByRole('button', { name: /Έναρξη εισαγωγής/ }).click()
  await expect(page.getByText('Η εισαγωγή ολοκληρώθηκε')).toBeVisible({ timeout: 20_000 })

  const createdCard = page.locator('div.text-center', { hasText: 'Δημιουργήθηκαν' })
  await expect(createdCard).toContainText('5')

  // ── Επαλήθευση στη βάση: τα 5 προϊόντα υπάρχουν, imported-only (mtrl null, DRAFT) ──
  const created = await prisma.product.findMany({
    where: { code: { in: CODES } },
    include: { translations: true },
  })
  expect(created).toHaveLength(5)
  for (const p of created) {
    expect(p.mtrl).toBeNull()
    expect(p.status).toBe('DRAFT')
    expect(p.translations.some(t => t.locale === 'el' && t.name.startsWith('Δοκιμαστικό Προϊόν'))).toBe(true)
  }
})
