import 'dotenv/config'
import { test, expect, type Page } from '@playwright/test'
import { prisma } from '../src/lib/prisma'

// ── Cookie consent banner (public site) + Νομικά (/cms/legal) publish flow ──
// Δύο ανεξάρτητα σενάρια σε ένα αρχείο (τρέχουν σειριακά μέσα στο ίδιο file).

let createdConsentLogId: string | null = null

test.afterAll(async () => {
  // Καθαρίζουμε ΜΟΝΟ το ConsentLog που δημιούργησε αυτό το test run (real IP/UA
  // artifact, όχι πραγματικός επισκέπτης) — οι LegalPages (seed) ΜΕΝΟΥΝ, είναι
  // το πραγματικό περιεχόμενο του site, όχι disposable test fixture.
  if (createdConsentLogId) {
    await prisma.consentLog.delete({ where: { id: createdConsentLogId } }).catch(() => {})
  }
  await prisma.$disconnect()
})

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

test('fresh context: banner στην αρχική → Αποδοχή όλων → κλείνει → reload δεν ξαναφαίνεται → καταγράφεται με IP/OS', async ({ page }) => {
  // Ο default `page` fixture του Playwright ξεκινά από απολύτως άδειο context
  // (καμία προϋπάρχουσα cookie) — δεν χρειάζεται επιπλέον setup.
  await page.goto('/')

  const banner = page.locator('.consent-bar, .consent-modal')
  await expect(banner).toBeVisible()
  await expect(banner.getByRole('button', { name: 'Αποδοχή όλων' })).toBeVisible()
  await expect(banner.getByRole('button', { name: 'Μόνο απαραίτητα' })).toBeVisible()
  await expect(banner.getByRole('button', { name: 'Προσαρμογή' })).toBeVisible()

  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes('/api/consent') && res.request().method() === 'POST'),
    banner.getByRole('button', { name: 'Αποδοχή όλων' }).click(),
  ])
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as { ok: boolean; id: string }
  expect(body.ok).toBe(true)
  createdConsentLogId = body.id

  await expect(banner).toBeHidden()

  // Πραγματικό full reload (όχι SPA navigation) — επιβεβαιώνει ότι το SSR
  // gating στο (public) layout διαβάζει σωστά το persisted cookie.
  await page.reload()
  await expect(page.locator('.consent-bar, .consent-modal')).toBeHidden()

  // ── Admin: /cms/consents δείχνει την εγγραφή με πραγματική IP + OS ──────
  await loginAsAdmin(page)
  await page.goto('/cms/consents?range=all')
  await expect(page.getByRole('heading', { name: 'Συγκαταθέσεις' })).toBeVisible()

  const firstDataRow = page.locator('table.data-table tbody tr').first()
  await expect(firstDataRow).toBeVisible()
  // local/dev χωρίς reverse proxy → getClientIp πέφτει πάντα στο ίδιο fallback.
  await expect(firstDataRow).toContainText(/127\.0\.0\.1|::1/)
  // OS parsed από το πραγματικό User-Agent του Chromium — ποτέ "Άγνωστο".
  await expect(firstDataRow).not.toContainText('Άγνωστο')
})

test('Νομικά: «Δημιουργία βασικών» → δημοσίευση Πολιτικής Απορρήτου → /legal/privacy-policy δείχνει τίτλο', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/cms/legal')
  await expect(page.getByRole('heading', { name: 'Νομικά' })).toBeVisible()

  // idempotent — είτε είναι η πρώτη φορά (δημιουργεί 6) είτε ξανά-κλικ (0 νέες).
  await page.getByRole('button', { name: 'Δημιουργία βασικών' }).click()
  await expect(page.getByText(/Δημιουργήθηκαν \d+ νέες σελίδες|υπάρχουν ήδη/)).toBeVisible()

  const row = page.getByRole('row', { name: /Πολιτική Απορρήτου/ })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: /Ενέργειες/ }).click()
  await page.getByRole('menuitem', { name: 'Επεξεργασία' }).click()

  await expect(page).toHaveURL(/\/cms\/legal\/[^/]+\/edit$/)
  await expect(page.getByRole('heading', { name: 'Πολιτική Απορρήτου' })).toBeVisible()

  const publishSwitch = page.getByRole('switch', { name: 'Δημοσίευση' })
  const alreadyPublished = (await publishSwitch.getAttribute('aria-checked')) === 'true'
  if (!alreadyPublished) {
    await publishSwitch.click()
  }
  await page.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText('Οι αλλαγές για «Πολιτική Απορρήτου» αποθηκεύτηκαν.')).toBeVisible()

  const publicResponse = await page.goto('/legal/privacy-policy')
  expect(publicResponse?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Πολιτική Απορρήτου' })).toBeVisible()
})
