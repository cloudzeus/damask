import 'dotenv/config'
import { test, expect, type Page } from '@playwright/test'
import { prisma } from '../src/lib/prisma'

// ── CMS «Νέα» (/cms/posts): tabs, δημιουργία κατηγορίας, χειροκίνητο άρθρο ──
// ΣΚΟΠΙΜΑ καμία πραγματική κλήση DeepSeek εδώ (Μετάφραση/«✨ Δημιουργία με AI»
// ΔΕΝ αγγίζονται) — αυτό δοκιμάστηκε χειροκίνητα με πραγματικά credentials,
// βλ. report του task.

const RUN_ID = Date.now()
const CATEGORY_NAME = `E2E Κατηγορία ${RUN_ID}`
const POST_TITLE = `E2E Άρθρο ${RUN_ID}`

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

test.afterAll(async () => {
  // cleanup — cascade διαγράφει PostTranslation/PostCategoryTranslation αυτόματα (onDelete: Cascade).
  await prisma.post.deleteMany({ where: { translations: { some: { title: POST_TITLE } } } })
  await prisma.postCategory.deleteMany({ where: { translations: { some: { name: CATEGORY_NAME } } } })
  await prisma.$disconnect()
})

test('/cms/posts δείχνει τις 3 καρτέλες (Άρθρα/Κατηγορίες/Συγγραφείς)', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/cms/posts')

  await expect(page.getByRole('heading', { name: 'Νέα' })).toBeVisible()

  const tabs = page.getByRole('tablist', { name: 'Ενότητες CMS' })
  await expect(tabs.getByRole('tab', { name: 'Άρθρα' })).toBeVisible()
  await expect(tabs.getByRole('tab', { name: 'Κατηγορίες' })).toBeVisible()
  await expect(tabs.getByRole('tab', { name: 'Συγγραφείς' })).toBeVisible()

  // Το panel «Άρθρα» είναι το προεπιλεγμένο.
  await expect(page.getByRole('tabpanel', { name: 'Άρθρα' })).toBeVisible()

  await tabs.getByRole('tab', { name: 'Κατηγορίες' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Κατηγορίες' })).toBeVisible()

  await tabs.getByRole('tab', { name: 'Συγγραφείς' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Συγγραφείς' })).toBeVisible()
})

test('δημιουργία κατηγορίας από την καρτέλα Κατηγορίες', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/cms/posts')
  await page.getByRole('tab', { name: 'Κατηγορίες' }).click()

  await page.getByRole('button', { name: 'Νέα κατηγορία' }).click()
  const createDialog = page.getByRole('dialog')
  await expect(createDialog.getByText('Νέα κατηγορία')).toBeVisible()

  await page.fill('#category-name-el', CATEGORY_NAME)
  await createDialog.getByRole('button', { name: 'Αποθήκευση' }).click()

  await expect(page.getByText(`Η κατηγορία «${CATEGORY_NAME}» δημιουργήθηκε.`)).toBeVisible()
  await expect(page.getByRole('cell', { name: CATEGORY_NAME, exact: true })).toBeVisible()
})

test('χειροκίνητη δημιουργία άρθρου: /cms/posts/new → αποθήκευση → εμφανίζεται στη λίστα', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/cms/posts')

  await page.getByRole('link', { name: 'Νέο άρθρο' }).click()
  await expect(page).toHaveURL(/\/cms\/posts\/new$/)
  await expect(page.getByRole('heading', { name: 'Νέο άρθρο' })).toBeVisible()

  // Το tab Ελληνικά είναι προεπιλεγμένο.
  await page.fill('#post-title-el', POST_TITLE)
  await page.fill('#post-body-el', '## Δοκιμαστικό άρθρο\n\nΠεριεχόμενο e2e δοκιμής.')

  // Το slug γεμίζει αυτόματα από τον τίτλο.
  await expect(page.locator('#post-slug')).not.toHaveValue('')

  await page.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText(`Το άρθρο «${POST_TITLE}» δημιουργήθηκε.`)).toBeVisible()
  await expect(page).toHaveURL(/\/cms\/posts\/[^/]+\/edit$/)

  await page.goto('/cms/posts')
  const row = page.getByRole('row', { name: new RegExp(POST_TITLE) })
  await expect(row).toBeVisible()
  await expect(row.getByText('Πρόχειρο')).toBeVisible()
  await expect(row.getByText('EN —')).toBeVisible()
})
