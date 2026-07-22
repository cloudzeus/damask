import { test, expect, type Page } from '@playwright/test'

// ── Tax Form Templates (Οδηγοί Εντύπων) — authoring happy path ───────────────
// Ίδιο login idiom με e2e/login.spec.ts / e2e/ocr-demo.spec.ts: ο seeded χρήστης
// gkozyris@i4ria.com είναι SUPER_ADMIN με όλα τα permissions, άρα καλύπτει και το
// `taxform.manage` που φρουρεί το /tax-templates (βλ. requirePermission στο
// src/app/(app)/tax-templates/page.tsx).

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

test('δημιουργία νέου οδηγού εντύπου (Ε3) → μεταφορά στον editor με το σωστό όνομα', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/tax-templates')
  await expect(page.getByRole('heading', { name: 'Οδηγοί Εντύπων' })).toBeVisible()

  await page.getByRole('button', { name: 'Νέος οδηγός' }).click()

  const dialog = page.getByRole('dialog', { name: 'Νέος οδηγός εντύπου' })
  await expect(dialog).toBeVisible()

  const guideName = `Ε3 e2e δοκιμή ${Date.now()}`
  await dialog.locator('#ng-code').fill('Ε3')
  await dialog.locator('#ng-name').fill(guideName)
  await dialog.locator('#ng-year').fill('2024')
  await dialog.getByRole('button', { name: 'Δημιουργία' }).click()

  // createTemplate() κάνει router.push(`/tax-templates/${id}`) μετά την επιτυχία —
  // ο editor δείχνει το όνομα και στο breadcrumb και στο <h1>.
  await expect(page).toHaveURL(/\/tax-templates\/[^/]+$/)
  await expect(page.getByRole('heading', { name: guideName })).toBeVisible()
})

// ── Βαθύτερα βήματα (σχεδίαση περιοχών πάνω σε δείγμα + δοκιμή OCR σάρωσης) ──
// Δεν καλύπτονται εδώ: απαιτούν πραγματικό ανέβασμα δείγματος εγγράφου (PDF/εικόνα
// πολλαπλών σελίδων) + drag-to-draw πάνω σε <canvas> με ακριβείς συντεταγμένες, και
// η OCR σάρωση χρειάζεται configured Gemini API key που ΔΕΝ υπάρχει σε αυτό το
// περιβάλλον (ίδιος περιορισμός με τα OCR tests στο e2e/ocr-demo.spec.ts). Το
// canvas-based region drawing δεν είναι αξιόπιστα ελέγξιμο μέσω Playwright χωρίς
// crisp pixel-coordinate μοντελοποίηση του rendered δείγματος.
test.skip('σχεδίαση περιοχής πεδίου πάνω στο δείγμα (RegionEditor drag-to-draw)', () => {
  // TODO: χρειάζεται πραγματικό sample upload + canvas pointer-drag με γνωστές
  // συντεταγμένες σελίδας· not reliably e2e-testable χωρίς σταθερό fixture εικόνας.
})

test.skip('δοκιμή σάρωσης πεδίου μέσω OCR (scan form dialog)', () => {
  // TODO: απαιτεί configured Gemini API key — δεν υπάρχει σε αυτό το περιβάλλον
  // (ίδιος περιορισμός με e2e/ocr-demo.spec.ts «ΧΩΡΙΣ Gemini configured»).
})
