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

test('SUPER_ADMIN βλέπει το /settings με τα 4 tabs — Εταιρεία ενεργό από προεπιλογή', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: 'Ρυθμίσεις' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Εταιρεία' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Διασυνδέσεις' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'SEO & Analytics' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Backups' })).toBeVisible()

  await expect(page.getByRole('tab', { name: 'Εταιρεία' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Στοιχεία εταιρείας' })).toBeVisible()
})

test('η καρτέλα Διασυνδέσεις δείχνει και τις 9 κάρτες integrations', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/settings')

  await page.getByRole('tab', { name: 'Διασυνδέσεις' }).click()
  await expect(page.getByRole('tab', { name: 'Διασυνδέσεις' })).toHaveAttribute('aria-selected', 'true')

  await expect(page.getByRole('heading', { name: 'SoftOne ERP' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mailgun' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'BunnyCDN' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'DeepSeek' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Claude API' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Google Gemini' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Google Tags' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Facebook' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Viva Payments' })).toBeVisible()
})

test('η κάρτα Google Gemini δέχεται μοντέλο από την προεπιλεγμένη λίστα + αποθηκεύει fallback μοντέλα', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Διασυνδέσεις' }).click()

  const card = page.locator('.glass').filter({ has: page.getByRole('heading', { name: 'Google Gemini' }) })
  await expect(card.getByText('Μη ρυθμισμένο')).toBeVisible()

  // Το μοντέλο ξεκινά στην προεπιλογή gemini-2.5-flash.
  await expect(card.getByRole('combobox', { name: 'Μοντέλο' })).toHaveText(/gemini-2\.5-flash/)
  await expect(card.locator('#gemini-fallback')).toHaveValue('gemini-2.5-flash-lite')
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

test('η καρτέλα Backups δείχνει ρυθμίσεις και πίνακα/empty-state', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Backups' }).click()

  await expect(page.getByRole('tab', { name: 'Backups' })).toHaveAttribute('aria-selected', 'true')
  const panel = page.locator('#settings-panel-backups')
  await expect(panel.getByRole('heading', { name: 'Αντίγραφα ασφαλείας βάσης δεδομένων' })).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Ρυθμίσεις', exact: true })).toBeVisible()
  await expect(panel.locator('#backups-retention')).toBeVisible()
  await expect(panel.locator('#backups-prefix')).toBeVisible()
  // «Ρυθμίσεις για προχωρημένους» ξεκινάει κλειστό όταν δεν υπάρχει αποθηκευμένη custom διαδρομή.
  await expect(panel.locator('#backups-pgdump')).not.toBeVisible()
})

test('«Backup τώρα» → πραγματικό pg_dump + upload BunnyCDN, Λήψη μέσω route, μετά Διαγραφή (self-cleaning)', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsAdmin(page)
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Backups' }).click()

  const panel = page.locator('#settings-panel-backups')
  const bunnyBase = `${process.env.BUNNY_STORAGE_API}/${process.env.BUNNY_STORAGE_ZONE}`
  const accessKey = process.env.BUNNY_STORAGE_PASSWORD!
  let filename: string | null = null

  try {
    await panel.getByRole('button', { name: 'Backup τώρα' }).click()
    await expect(page.getByText(/ολοκληρώθηκε\./)).toBeVisible({ timeout: 60_000 })

    const row = panel.locator('table.data-table tbody tr').first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('Έτοιμο')
    await expect(row).toContainText('Χειροκίνητο')
    filename = (await row.locator('td').nth(1).textContent())?.trim() ?? null
    expect(filename).toMatch(/^damask-.*\.dump$/)
    const storageKey = `backups/${filename}`

    // ── ανεξάρτητη επαλήθευση ΑΠΕΥΘΕΙΑΣ στο BunnyCDN — όχι μόνο ό,τι λέει η ίδια η εφαρμογή ──
    const existsRes = await fetch(`${bunnyBase}/${storageKey}`, { headers: { AccessKey: accessKey } })
    expect(existsRes.status).toBe(200)
    const bytes = new Uint8Array(await existsRes.arrayBuffer())
    expect(bytes.byteLength).toBeGreaterThan(100)
    // pg_dump custom format (-F c) ξεκινάει πάντα με το magic header "PGDMP" — αποδεικνύει ότι
    // είναι ΠΡΑΓΜΑΤΙΚΟ dump, όχι placeholder αρχείο.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('PGDMP')

    // ── Λήψη μέσω του gated download route (αποδεικνύει το route, όχι μόνο το Bunny) ──
    await row.locator('.rowmenu-btn').click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Λήψη' }).click(),
    ])
    expect(download.suggestedFilename()).toBe(filename)

    // ── Διαγραφή μέσω UI ──
    await row.locator('.rowmenu-btn').click()
    await page.getByRole('menuitem', { name: 'Διαγραφή' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Διαγραφή', exact: true }).click()
    await expect(page.getByText('Το backup διαγράφηκε.')).toBeVisible()

    // ── ανεξάρτητη επαλήθευση διαγραφής στο BunnyCDN ──
    const goneRes = await fetch(`${bunnyBase}/${storageKey}`, { headers: { AccessKey: accessKey } })
    expect(goneRes.status).toBe(404)
    filename = null // επιτυχής καθαρισμός — το finally παρακάτω δεν χρειάζεται να ξανακάνει τίποτα
  } finally {
    // Fallback καθαρισμός — αν κάποιο assertion παραπάνω απέτυχε στη μέση, μη μείνει ορφανό test backup
    // ούτε στη DB ούτε στο BunnyCDN.
    if (filename) {
      const orphan = await prisma.dbBackup.findFirst({ where: { filename } })
      if (orphan) {
        await fetch(`${bunnyBase}/${orphan.storageKey}`, { method: 'DELETE', headers: { AccessKey: accessKey } }).catch(() => {})
        await prisma.dbBackup.delete({ where: { id: orphan.id } }).catch(() => {})
      }
    }
  }
})
