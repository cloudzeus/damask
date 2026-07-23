import { test, expect, type Page } from '@playwright/test'

// ── Έργα / PM hub (Task 14 — e2e, final task of Program PM C2a.1) ───────────
// Ίδιο login idiom με e2e/login.spec.ts / e2e/programs.spec.ts: ο seeded
// χρήστης gkozyris@i4ria.com είναι SUPER_ADMIN με όλα τα permissions, άρα
// καλύπτει και το `pm.work` που φρουρεί το /pm (βλ. requirePermission στο
// src/app/(app)/pm/page.tsx).

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

test('η σελίδα Έργα φορτώνει για SUPER_ADMIN — heading + λίστα/κενή κατάσταση', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/pm')
  await expect(page.getByRole('heading', { name: 'Έργα' })).toBeVisible()

  // prisma/seed.ts δεν σπέρνει PM applications (grep "programApplication" στο
  // seed.ts δεν επιστρέφει τίποτα), άρα το πραγματικό runtime αναμενόμενο
  // state είναι το empty state του πίνακα («Δεν υπάρχουν έργα.» — βλ.
  // src/app/(app)/pm/page.tsx). Δεχόμαστε ΚΑΙ την περίπτωση να υπάρχουν ήδη
  // γραμμές (π.χ. αν κάποιος έτρεξε manually το programs.spec.ts flow πριν),
  // οπότε ελέγχουμε είτε το empty-state κείμενο είτε τουλάχιστον μία γραμμή
  // δεδομένων στο table body.
  const table = page.locator('table.data-table')
  await expect(table).toBeVisible()
  const emptyState = page.getByText('Δεν υπάρχουν έργα.')
  const dataRows = table.locator('tbody tr.dotted-row-bottom')
  await expect(emptyState.or(dataRows.first())).toBeVisible()
})

// ── Application hub (stage stepper + tab bar) — ΔΕΝ καλύπτεται εδώ ──────────
// Το ApplicationHub (src/components/pm/application-hub.tsx) ζωντανεύει στο
// /programs/[id]/applications/[appId] και απαιτεί ήδη υπαρκτή
// ProgramApplication row — δηλαδή ένα seeded πρόγραμμα ΚΑΙ μία αίτηση
// συνδεδεμένη με πραγματικό TRDR (πελάτη). prisma/seed.ts δεν σπέρνει καμία
// από τις δύο οντότητες, οπότε δεν υπάρχει σταθερό deep-link για e2e χωρίς
// πρώτα να τρέξει το πλήρες create-application flow (το οποίο ούτε αυτό
// είναι seeded — βλ. skip στο e2e/programs.spec.ts).
test.skip('application hub: stage stepper + tabs (Αξιολόγηση/Υποχρεώσεις/Δαπάνες/Παραδοτέα/ΟΠΣΚΕ)', () => {
  // TODO: χρειάζεται seeded πρόγραμμα + αίτηση συνδεδεμένη με πελάτη (TRDR) —
  // δεν υπάρχει στο prisma/seed.ts αυτή τη στιγμή.
})

test.skip('δημιουργία αίτησης προγράμματος για πελάτη', () => {
  // TODO: χρειάζεται seeded πρόγραμμα + partner/company να συνδεθεί ως
  // αιτούμενος — δεν καλύπτεται από το τρέχον seed.
})

test.skip('παραγωγή υποχρεώσεων (generate obligations) από πρότυπο προγράμματος', () => {
  // TODO: εξαρτάται από seeded πρόγραμμα με obligation templates + αίτηση —
  // δεν υπάρχουν seeded δεδομένα.
})

test.skip('upload δικαιολογητικού στο tab Υποχρεώσεις & Δικαιολογητικά', () => {
  // TODO: εξαρτάται από seeded αίτηση + λειτουργικό BunnyCDN/upload
  // περιβάλλον — δεν είναι configured σε αυτό το test environment (ίδιος
  // περιορισμός με τα upload/OCR tests στο e2e/media-collection.spec.ts /
  // e2e/ocr-demo.spec.ts).
})
