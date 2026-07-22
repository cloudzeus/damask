import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { prisma } from '../src/lib/prisma'

/**
 * E2E για το Universal Ingestion Core (Task 15) — μοναδικό reachable entry point
 * είναι το «Καταχώριση από…» στη σελίδα Συναλλασσόμενοι (δεν υπάρχει λίστα
 * Προϊόντων στην εφαρμογή, βλ. src/app/(app)/partners/page.tsx).
 *
 * Ροή drawer: Πηγή → Αντιστοίχιση → Έλεγχος → Καταχώριση
 * (src/components/ingestion/ingest-drawer.tsx)
 */

const EXCEL_AFM = '094014201'
const EXCEL_NAME = 'E2E Δοκιμή ΑΕ'
const API_AFM = '094014202'

const FIXTURE_CSV = path.join(__dirname, 'fixtures', 'ingestion-partner.csv')

test.afterAll(async () => {
  await prisma.trdr.deleteMany({ where: { AFM: { in: [EXCEL_AFM, API_AFM] } } })
  await prisma.$disconnect()
})

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

/** Ανοίγει τη σελίδα Συναλλασσόμενοι και το drawer «Καταχώριση από…». */
async function openIngestDrawer(page: Page) {
  await page.goto('/partners')
  await expect(page.getByRole('heading', { name: 'Συναλλασσόμενοι' })).toBeVisible()
  await page.getByRole('button', { name: /Καταχώριση από/ }).click()
  await expect(page.getByRole('heading', { name: 'Πηγή δεδομένων' })).toBeVisible()
}

/**
 * Διαβάζει τα totals του τελευταίου commit από τη σύνοψη-πρόταση («N δημιουργήθηκαν ·
 * M ενημερώθηκαν · K απέτυχαν», step-ingest-commit.tsx). Στοχεύουμε το <p> μέσω του
 * ΜΟΝΑΔΙΚΟΥ συνδυασμού κλάσεων tailwind (mt-0.5 + text-[12px]) — ΟΧΙ μέσω hasText
 * με τη λέξη "ενημερώθηκαν", γιατί το Playwright's hasText κάνει case-INsensitive
 * substring match, άρα θα ταίριαζε ΚΑΙ με το card-label "Ενημερώθηκαν" (κεφαλαίο Ε)
 * παρακάτω στο ίδιο component → strict-mode violation (2 elements).
 */
async function readCommitSummary(page: Page): Promise<string> {
  await expect(page.getByText('Η καταχώριση ολοκληρώθηκε')).toBeVisible({ timeout: 20_000 })
  const summary = page.locator('p.mt-0\\.5.text-\\[12px\\].text-muted-foreground')
  await expect(summary).toBeVisible()
  return (await summary.textContent()) ?? ''
}

test('Excel → Partners: upload CSV, auto-mapping, έλεγχος, καταχώριση', async ({ page }) => {
  await loginAsAdmin(page)
  await openIngestDrawer(page)

  // ── Βήμα 1 — Πηγή: επιλογή «Excel» και ανέβασμα του CSV fixture ──────────
  await page.getByRole('button', { name: 'Excel', exact: true }).click()

  const csvBuffer = fs.readFileSync(FIXTURE_CSV)
  await page.locator('#excel-file').setInputFiles({
    name: 'ingestion-partner.csv',
    mimeType: 'text/csv',
    buffer: csvBuffer,
  })

  // Το panel αυτόματα ανιχνεύει το (μοναδικό) φύλλο του CSV — δεν χρειάζεται
  // αλλαγή επιλογής, απλά «Φόρτωση».
  const loadButton = page.getByRole('button', { name: 'Φόρτωση' })
  await expect(loadButton).toBeVisible({ timeout: 10_000 })
  await loadButton.click()
  await expect(page.getByText(/^1 γραμμές$/)).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Επόμενο →' }).click()

  // ── Βήμα 2 — Αντιστοίχιση: ΑΦΜ→afm και Επωνυμία→name πρέπει να γίνουν auto-match ──
  await expect(page.getByRole('heading', { name: 'Αντιστοίχιση πεδίων' })).toBeVisible()
  // Καμία ένδειξη «· απαιτείται» (badge ή προειδοποίηση) → και τα δύο υποχρεωτικά
  // πεδία (ΑΦΜ, Επωνυμία) έχουν ήδη αντιστοιχιστεί αυτόματα.
  await expect(page.getByText('απαιτείται')).toHaveCount(0)
  const nextAtMap = page.getByRole('button', { name: 'Επόμενο →' })
  await expect(nextAtMap).toBeEnabled()
  await nextAtMap.click()

  // ── Βήμα 3 — Έλεγχος: ≥1 έγκυρη γραμμή, 0 σφάλματα ────────────────────────
  await expect(page.getByRole('heading', { name: 'Έλεγχος δεδομένων' })).toBeVisible()
  await expect(page.getByText('1 έγκυρες')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('0 σφάλματα')).toBeVisible()
  await expect(page.getByText('Έτοιμο για καταχώριση')).toBeVisible()

  await page.getByRole('button', { name: 'Επόμενο →' }).click()

  // ── Βήμα 4 — Καταχώριση ──────────────────────────────────────────────────
  // exact:true — αλλιώς ταιριάζει και ο τίτλος του drawer «Καταχώριση: Συναλλασσόμενοι» (h2, substring match by default).
  await expect(page.getByRole('heading', { name: 'Καταχώριση', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click()

  const summaryText = await readCommitSummary(page)
  // Πρώτη εκτέλεση → «1 δημιουργήθηκαν»· επανεκτέλεση (rerun, ίδιο ΑΦΜ, upsert) → «1 ενημερώθηκαν».
  expect(summaryText).toMatch(/(1 δημιουργήθηκαν|1 ενημερώθηκαν)/)
  expect(summaryText).toContain('0 απέτυχαν')

  // ── Επαλήθευση: ο συναλλασσόμενος υπάρχει στη λίστα (φρέσκο reload) ──────
  await page.goto('/partners')
  await page.getByPlaceholder('Αναζήτηση με επωνυμία, ΑΦΜ ή πόλη…').fill(EXCEL_AFM)
  await expect(page.getByText(EXCEL_NAME)).toBeVisible()
  await expect(page.getByText(EXCEL_AFM)).toBeVisible()
})

// ── API → Partners ──────────────────────────────────────────────────────────
// ΔΕΝ τρέχει: το acquireFromApi (src/lib/ingestion/actions.ts) κάνει το fetch
// SERVER-SIDE (μέσα σε server action), άρα το page.route (browser-level
// interception) ΔΕΝ το πιάνει — δεν υπάρχει τρόπος να στήσουμε mock response
// από το Playwright γι' αυτό το path. Επιπλέον το assertSafeIngestUrl
// (src/lib/ingestion/api-normalize.ts) απαγορεύει ρητά http/localhost/private
// IP endpoints (SSRF guard: μόνο https + δημόσιο host), άρα ούτε το ίδιο το
// Playwright webServer (http://localhost:3000) μπορεί να χρησιμοποιηθεί ως
// stub endpoint. Δεν υπάρχει διαθέσιμο public HTTPS static-JSON endpoint μέσα
// σε αυτό το harness χωρίς εξωτερική εξάρτηση, άρα το test παραμένει skipped
// (ίδιο idiom με το «SKIP live» pattern στο e2e/ocr-demo.spec.ts).
//
// NOT RUNNING: acquireFromApi's fetch happens server-side inside a Next.js
// server action, so Playwright's page.route (browser-level) cannot intercept
// it, and the SSRF guard (assertSafeIngestUrl) explicitly rejects
// http/localhost/private-IP hosts — so even this repo's own webServer cannot
// serve as a stub target. Skipped rather than depending on a real external
// HTTPS endpoint.
test('API → Partners: fetch JSON, mapping, έλεγχος, καταχώριση', async ({ page }) => {
  test.skip(true, 'server-side fetch (server action) δεν παρεμβαίνεται από page.route· SSRF guard αποκλείει http/localhost/private-IP stub targets — δες σχόλιο πάνω από το test.')

  await loginAsAdmin(page)
  await openIngestDrawer(page)

  await page.getByRole('button', { name: 'API endpoint', exact: true }).click()
  await page.locator('#api-url').fill(`https://example.invalid/e2e/${API_AFM}.json`)
  await page.getByRole('button', { name: 'Ανάκτηση', exact: true }).click()
  await expect(page.getByText(/^1 εγγραφές$/)).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Επόμενο →' }).click()
  await expect(page.getByText('απαιτείται')).toHaveCount(0)
  await page.getByRole('button', { name: 'Επόμενο →' }).click()

  await expect(page.getByText('1 έγκυρες')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('0 σφάλματα')).toBeVisible()
  await page.getByRole('button', { name: 'Επόμενο →' }).click()

  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click()
  const summaryText = await readCommitSummary(page)
  expect(summaryText).toMatch(/(1 δημιουργήθηκαν|1 ενημερώθηκαν)/)
  expect(summaryText).toContain('0 απέτυχαν')
})
