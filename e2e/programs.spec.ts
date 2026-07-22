import { test, expect, type Page } from '@playwright/test'

// ── Προγράμματα (Program Extraction) — authoring happy path ──────────────────
// Ίδιο login idiom με e2e/login.spec.ts / e2e/tax-templates.spec.ts: ο seeded
// χρήστης gkozyris@i4ria.com είναι SUPER_ADMIN με όλα τα permissions, άρα
// καλύπτει και το `programs.manage` που φρουρεί το /programs (βλ.
// requirePermission στο src/app/(app)/programs/page.tsx).

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

test('η σελίδα Προγράμματα φορτώνει και το «Νέο πρόγραμμα» ανοίγει τον διάλογο δημιουργίας', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/programs')
  await expect(page.getByRole('heading', { name: 'Προγράμματα' })).toBeVisible()

  await page.getByRole('button', { name: 'Νέο πρόγραμμα' }).click()

  const dialog = page.getByRole('dialog', { name: 'Νέο πρόγραμμα' })
  await expect(dialog).toBeVisible()

  const title = `Πρόγραμμα e2e δοκιμή ${Date.now()}`
  await dialog.locator('#np-title').fill(title)
  await expect(dialog.locator('#np-title')).toHaveValue(title)

  await expect(dialog.getByRole('button', { name: 'Δημιουργία & Αποδελτίωση' })).toBeVisible()
})

// ── Πλήρης δημιουργία (upload PDF → extractPdfText → createProgram →
// extractProgram με DeepSeek) — ΔΕΝ καλύπτεται εδώ ─────────────────────────
// new-program-dialog.tsx απαιτεί ΚΑΙ τίτλο ΚΑΙ αρχείο PDF (βλ. handleSubmit:
// `if (!file) nextErrors.file = 'Επίλεξε το PDF της προκήρυξης.'`) — δεν
// υπάρχει «μόνο τίτλος» create path. Το submit-flow περνάει το PDF από
// pdf-text.ts (client-side εξαγωγή κειμένου) και μετά καλεί το server action
// extractProgram(id, text), που χρειάζεται configured DeepSeek API key — δεν
// υπάρχει σε αυτό το περιβάλλον (ίδιος περιορισμός με τα Gemini-based OCR
// tests στο e2e/ocr-demo.spec.ts / e2e/tax-templates.spec.ts). Χρειάζεται
// επίσης ένα πραγματικό text-based PDF fixture (όχι σαρωμένη εικόνα, αλλιώς
// το extractPdfText() γυρνάει κενό κείμενο και το flow σταματάει νωρίς).
test.skip('δημιουργία νέου προγράμματος από PDF προκήρυξης (upload → αποδελτίωση DeepSeek)', () => {
  // TODO: χρειάζεται text-PDF fixture + configured DeepSeek API key — not
  // available in this environment.
})
