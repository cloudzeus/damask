import 'dotenv/config'
import { test, expect, type Page } from '@playwright/test'
import { prisma } from '../src/lib/prisma'

const RUN_ID = Date.now()
const PARTNER_NAME = `E2E Συναλλασσόμενος ${RUN_ID}`
const CONTACT_NAME = `E2E Επαφή ${RUN_ID}`
const CONTACT_EMAIL = `e2e-contact-${RUN_ID}@example.gr`

test.afterAll(async () => {
  await prisma.accessRequest.deleteMany({ where: { email: CONTACT_EMAIL } })
  await prisma.trdr.deleteMany({ where: { NAME: PARTNER_NAME } })
  await prisma.$disconnect()
})

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

test('admin sees the partners page with KPIs and tabs', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/partners')

  await expect(page.getByRole('heading', { name: 'Συναλλασσόμενοι' })).toBeVisible()
  await expect(page.getByText('Πελάτες', { exact: true })).toBeVisible()
  await expect(page.getByText('Προμηθευτές', { exact: true })).toBeVisible()
  await expect(page.getByText('Νέοι μήνα')).toBeVisible()

  await expect(page.getByRole('button', { name: /Πελάτες/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Προμηθευτές/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Leads/ })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
})

test('δημιουργία τοπικού συναλλασσόμενου, μετατροπή LEAD→CUSTOMER, επαφή + αίτημα πρόσβασης', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/partners')

  // ── 1) Δημιουργία τοπικού συναλλασσόμενου (χωρίς Google Places — απλά πεδία) ──
  await page.getByRole('button', { name: 'Νέος συναλλασσόμενος' }).click()

  const createDialog = page.getByRole('dialog')
  await expect(createDialog.getByText('Νέος συναλλασσόμενος')).toBeVisible()

  // Sodtype default = Πελάτης, status default = Υποψήφιος (LEAD) — δεν αγγίζουμε τα selects.
  await page.fill('#partner-form-name', PARTNER_NAME)
  await page.fill('#partner-form-address', 'Δοκιμαστική Οδός 1')
  await page.fill('#partner-form-city', 'Αθήνα')
  await page.fill('#partner-form-zip', '10559')

  await createDialog.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText(`Ο συναλλασσόμενος «${PARTNER_NAME}» δημιουργήθηκε.`)).toBeVisible()

  // onCreated → redirect στην καρτέλα
  await expect(page).toHaveURL(/\/partners\/[a-z0-9]+/)
  await expect(page.getByRole('heading', { name: PARTNER_NAME })).toBeVisible()
  await expect(page.getByText('Υποψήφιος')).toBeVisible()

  // ── 2) LEAD → CUSTOMER ────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Μετατροπή σε Πελάτη' }).click()
  await expect(page.getByText(`«${PARTNER_NAME}» έγινε Πελάτης.`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Μετατροπή σε Πελάτη' })).toHaveCount(0)

  // ── 3) Προσθήκη επαφής ────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Επαφή', exact: true }).click()
  const contactDialog = page.getByRole('dialog')
  await expect(contactDialog.getByText('Νέα επαφή')).toBeVisible()
  await page.fill('#contact-form-name', CONTACT_NAME)
  await page.fill('#contact-form-email', CONTACT_EMAIL)
  await contactDialog.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText(`Η επαφή «${CONTACT_NAME}» προστέθηκε.`)).toBeVisible()

  const contactRow = page.locator('div').filter({ hasText: CONTACT_NAME }).last()
  await expect(page.getByText(CONTACT_NAME)).toBeVisible()

  // ── 4) «Αίτημα πρόσβασης user» ────────────────────────────────────────
  await page.getByRole('button', { name: `Ενέργειες για ${CONTACT_NAME}` }).click()
  await page.getByRole('menuitem', { name: 'Αίτημα πρόσβασης user' }).click()
  await expect(page.getByText(`Το αίτημα πρόσβασης για «${CONTACT_NAME}» δημιουργήθηκε.`)).toBeVisible()
  await expect(contactRow.getByText('Αίτημα σε αναμονή')).toBeVisible()

  // ── 5) Εμφανίζεται στο /users ─────────────────────────────────────────
  await page.goto('/users')
  await expect(page.getByText('Αιτήματα B2B σε αναμονή')).toBeVisible()
  await expect(page.getByText(CONTACT_NAME)).toBeVisible()
  await expect(page.getByText('Από επαφή συναλλασσόμενου')).toBeVisible()
})
