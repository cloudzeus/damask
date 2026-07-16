import 'dotenv/config'
import { deflateSync } from 'node:zlib'
import { test, expect, type Page } from '@playwright/test'
import { prisma } from '../src/lib/prisma'

// ── Ελάχιστος, χωρίς εξαρτήσεις, PNG encoder — ίδιος με e2e/media-collection.spec.ts ──

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    let c = (crc ^ buf[i]) & 0xff
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    }
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function makeSolidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8
  ihdrData[9] = 2
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdr = pngChunk('IHDR', ihdrData)

  const rowBytes = width * 3
  const raw = Buffer.alloc((rowBytes + 1) * height)
  const [r, g, b] = rgb
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1)
    raw[rowStart] = 0
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3
      raw[px] = r
      raw[px + 1] = g
      raw[px + 2] = b
    }
  }
  const idat = pngChunk('IDAT', deflateSync(raw))
  const iend = pngChunk('IEND', Buffer.alloc(0))
  return Buffer.concat([signature, ihdr, idat, iend])
}

// ── Media Gallery: φάκελοι + upload + reusable MediaPicker ──────────────────

const RUN_ID = Date.now()
const FOLDER_NAME = `E2E Φάκελος ${RUN_ID}`
const FOLDER_RENAMED = `E2E Φάκελος Μετ. ${RUN_ID}`
const ASSET_BASE_NAME = `e2e-media-gallery-${RUN_ID}`

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

test.afterAll(async () => {
  // Άμυνα: αν κάποιο βήμα του UI-driven cleanup μέσα στο test αποτύχει πριν
  // φτάσει εκεί, μην αφήσεις σκουπίδια στο Bunny storage / DB.
  const leftoverAssets = await prisma.mediaAsset.findMany({ where: { name: { startsWith: 'e2e-media-gallery-' } } })
  const storageApi = process.env.BUNNY_STORAGE_API
  const storageZone = process.env.BUNNY_STORAGE_ZONE
  const storagePassword = process.env.BUNNY_STORAGE_PASSWORD
  const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL
  for (const asset of leftoverAssets) {
    if (storageApi && storageZone && storagePassword && pullZoneUrl && asset.cdnUrl.startsWith(pullZoneUrl)) {
      const storagePath = asset.cdnUrl.slice(pullZoneUrl.length).replace(/^\/+/, '')
      try {
        await fetch(`${storageApi}/${storageZone}/${storagePath}`, { method: 'DELETE', headers: { AccessKey: storagePassword } })
      } catch {
        // best effort — το DB cleanup παρακάτω τρέχει ούτως ή άλλως
      }
    }
  }
  await prisma.mediaAsset.deleteMany({ where: { name: { startsWith: 'e2e-media-gallery-' } } })
  await prisma.mediaFolder.deleteMany({ where: { name: { contains: 'E2E Φάκελος' } } })
  await prisma.$disconnect()
})

test('Media Gallery: φάκελοι, upload, και το MediaPicker end-to-end', async ({ page }) => {
  test.setTimeout(120_000) // πραγματικά uploads/deletes στο BunnyCDN

  await loginAsAdmin(page)
  await page.goto('/media')
  await expect(page.getByRole('heading', { name: 'Media Gallery' })).toBeVisible()

  // ── 1) Δημιουργία φακέλου ─────────────────────────────────────────────
  await page.getByRole('button', { name: 'Νέος φάκελος' }).click()
  const createDialog = page.getByRole('dialog')
  await expect(createDialog.getByText('Νέος φάκελος')).toBeVisible()
  await page.fill('#folder-name-input', FOLDER_NAME)
  await createDialog.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText(`Ο φάκελος «${FOLDER_NAME}» δημιουργήθηκε.`)).toBeVisible()

  const folderRow = page.getByRole('button', { name: FOLDER_NAME, exact: true })
  await expect(folderRow).toBeVisible()

  // ── 2) Μετονομασία ────────────────────────────────────────────────────
  await page.getByRole('button', { name: `Ενέργειες για τον φάκελο ${FOLDER_NAME}` }).click()
  await page.getByRole('menuitem', { name: 'Μετονομασία' }).click()

  const renameDialog = page.getByRole('dialog')
  await expect(renameDialog.getByText('Μετονομασία φακέλου')).toBeVisible()
  const nameInput = page.locator('#folder-name-input')
  await nameInput.fill('')
  await nameInput.fill(FOLDER_RENAMED)
  await renameDialog.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText('Ο φάκελος μετονομάστηκε.')).toBeVisible()

  const renamedFolderRow = page.getByRole('button', { name: FOLDER_RENAMED, exact: true })
  await expect(renamedFolderRow).toBeVisible()

  // ── 3) Επιλογή φακέλου + μεταφόρτωση 1 png μέσα του ────────────────────
  await renamedFolderRow.click()

  await page.getByRole('button', { name: 'Μεταφόρτωση', exact: true }).click()
  const uploadDialog = page.getByRole('dialog')
  await expect(uploadDialog.getByText('Μεταφόρτωση αρχείων')).toBeVisible()
  await expect(uploadDialog.getByText(`«${FOLDER_RENAMED}»`)).toBeVisible()

  await uploadDialog.locator('input[type=file]').setInputFiles({
    name: `${ASSET_BASE_NAME}.png`,
    mimeType: 'image/png',
    buffer: makeSolidPng(40, 40, [124, 58, 237]),
  })
  await expect(page.getByText('1/1 ολοκληρώθηκαν')).toBeVisible({ timeout: 60_000 })

  await page.keyboard.press('Escape')
  await expect(uploadDialog).toBeHidden()

  // ── 4) Το αρχείο εμφανίζεται στο grid του φακέλου ──────────────────────
  await expect(page.getByText(ASSET_BASE_NAME)).toBeVisible()

  // ── 5) MediaPicker: κουμπί δοκιμής → tab Gallery → επιλογή → συλλογή ───
  await page.getByRole('button', { name: 'Δοκιμή Picker' }).click()
  const pickerDialog = page.getByRole('dialog')
  await expect(pickerDialog.getByText('Επιλογή media')).toBeVisible()
  // Gallery είναι το προεπιλεγμένο tab
  await expect(pickerDialog.getByRole('button', { name: 'Gallery' })).toBeVisible()

  const pickerCell = pickerDialog.getByRole('button', { name: ASSET_BASE_NAME })
  await expect(pickerCell).toBeVisible({ timeout: 15_000 })
  await pickerCell.click()
  await expect(pickerDialog.getByText('Επιλογή (1)')).toBeVisible()

  await pickerDialog.getByRole('button', { name: 'Προσθήκη (1)' }).click()
  await expect(pickerDialog).toBeHidden()

  await expect(page.getByRole('heading', { name: /Επιλεγμένα από το MediaPicker/ })).toBeVisible()
  await expect(page.locator('button[aria-label^="Εικόνα"]')).toHaveCount(1)

  // ── 6) Cleanup μέσω των ίδιων actions (πραγματικό Bunny delete) ────────
  // Το κουμπί ⋮ είναι ορατό μόνο σε hover πάνω στην κάρτα (opacity-0 → group-hover) —
  // hover πάνω στο όνομα αρκεί, αφού το CSS :hover ανεβαίνει σε όλους τους προγόνους.
  await page.getByText(ASSET_BASE_NAME).hover()
  await page.getByRole('button', { name: `Ενέργειες για ${ASSET_BASE_NAME}` }).click()
  await page.getByRole('menuitem', { name: 'Διαγραφή' }).click()

  const deleteAssetDialog = page.getByRole('alertdialog')
  await expect(deleteAssetDialog.getByText(`Διαγραφή «${ASSET_BASE_NAME}»;`)).toBeVisible()
  await deleteAssetDialog.getByRole('button', { name: 'Διαγραφή', exact: true }).click()
  await expect(page.getByText(`Το αρχείο «${ASSET_BASE_NAME}» διαγράφηκε.`)).toBeVisible({ timeout: 30_000 })
  // exact: true — αλλιώς ταιριάζει ΚΑΙ το toast ΚΑΙ τον (ήδη κλείνοντα) τίτλο του AlertDialog,
  // που περιέχουν το ίδιο όνομα ως υποσύνολο κειμένου.
  await expect(page.getByText(ASSET_BASE_NAME, { exact: true })).toBeHidden()

  await page.getByRole('button', { name: `Ενέργειες για τον φάκελο ${FOLDER_RENAMED}` }).click()
  await page.getByRole('menuitem', { name: 'Διαγραφή' }).click()

  const deleteFolderDialog = page.getByRole('alertdialog')
  await expect(deleteFolderDialog.getByText(`Διαγραφή φακέλου «${FOLDER_RENAMED}»;`)).toBeVisible()
  await deleteFolderDialog.getByRole('button', { name: 'Διαγραφή', exact: true }).click()
  await expect(page.getByText(`Ο φάκελος «${FOLDER_RENAMED}» διαγράφηκε.`)).toBeVisible()
  await expect(page.getByRole('button', { name: FOLDER_RENAMED, exact: true })).toBeHidden()
})

// ── Media Gallery v2: lightbox, ρυθμιζόμενα thumbnails, bulk + αναδρομική διαγραφή ──

const V2_ASSET_1 = `e2e-media-gallery-v2-${RUN_ID}-a`
const V2_ASSET_2 = `e2e-media-gallery-v2-${RUN_ID}-b`
const V2_FOLDER_NAME = `E2E Φάκελος V2 ${RUN_ID}`
const V2_FORCE_ASSET = `e2e-media-gallery-v2-${RUN_ID}-force`

test('Media Gallery v2: lightbox, slider μεγέθους, bulk delete, και force-delete φακέλου με «ΔΙΑΓΡΑΦΗ»', async ({ page }) => {
  test.setTimeout(120_000) // πραγματικά uploads/deletes στο BunnyCDN

  await loginAsAdmin(page)
  await page.goto('/media')
  await expect(page.getByRole('heading', { name: 'Media Gallery' })).toBeVisible()

  // ── 1) Upload 2 εικόνων στη ρίζα ("Όλα τα αρχεία") ──────────────────────
  await page.getByRole('button', { name: 'Μεταφόρτωση', exact: true }).click()
  const uploadDialog = page.getByRole('dialog')
  await expect(uploadDialog.getByText('Μεταφόρτωση αρχείων')).toBeVisible()

  await uploadDialog.locator('input[type=file]').setInputFiles([
    { name: `${V2_ASSET_1}.png`, mimeType: 'image/png', buffer: makeSolidPng(40, 40, [10, 120, 200]) },
    { name: `${V2_ASSET_2}.png`, mimeType: 'image/png', buffer: makeSolidPng(40, 40, [200, 60, 10]) },
  ])
  await expect(page.getByText('2/2 ολοκληρώθηκαν')).toBeVisible({ timeout: 60_000 })
  await page.keyboard.press('Escape')
  await expect(uploadDialog).toBeHidden()

  await expect(page.getByText(V2_ASSET_1)).toBeVisible()
  await expect(page.getByText(V2_ASSET_2)).toBeVisible()

  // ── 2) Slider μεγέθους μικρογραφιών — αλλάζει --thumb-size στο grid ─────
  const grid = page.locator('.stagger.grid')
  const initialThumbSize = await grid.evaluate(el => (el as HTMLElement).style.getPropertyValue('--thumb-size'))
  const slider = page.getByLabel('Μέγεθος μικρογραφιών')
  await slider.focus()
  await slider.press('End') // άκρη του range → THUMB_SIZE_MAX (280px)
  await expect.poll(() => grid.evaluate(el => (el as HTMLElement).style.getPropertyValue('--thumb-size'))).toBe('280px')
  expect(initialThumbSize).not.toBe('280px')

  // ── 3) Lightbox: κλικ σε asset ανοίγει full-res προβολή, ESC κλείνει ────
  await page.getByRole('button', { name: `Προβολή ${V2_ASSET_1} σε πλήρη ανάλυση` }).click()
  const lightbox = page.getByRole('dialog', { name: `Προβολή «${V2_ASSET_1}»` })
  await expect(lightbox).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lightbox).toBeHidden()

  // ── 4) Bulk delete: «Επιλογή» → checkboxes → «Διαγραφή επιλεγμένων (2)» ─
  await page.getByRole('button', { name: 'Επιλογή', exact: true }).click()
  await page.getByRole('checkbox', { name: `Επιλογή ${V2_ASSET_1}` }).click()
  await page.getByRole('checkbox', { name: `Επιλογή ${V2_ASSET_2}` }).click()
  await expect(page.getByText('2 επιλεγμένα')).toBeVisible()

  await page.getByRole('button', { name: 'Διαγραφή επιλεγμένων (2)' }).click()
  const bulkDeleteDialog = page.getByRole('alertdialog')
  await expect(bulkDeleteDialog.getByText('Διαγραφή 2 επιλεγμένων αρχείων;')).toBeVisible()
  await bulkDeleteDialog.getByRole('button', { name: 'Διαγραφή', exact: true }).click()
  await expect(page.getByText('2 αρχεία διαγράφηκαν.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(V2_ASSET_1, { exact: true })).toBeHidden()
  await expect(page.getByText(V2_ASSET_2, { exact: true })).toBeHidden()

  // ── 5) Φάκελος ΜΕ περιεχόμενα — force-delete flow με πληκτρολόγηση «ΔΙΑΓΡΑΦΗ» ──
  await page.getByRole('button', { name: 'Νέος φάκελος' }).click()
  const createDialog = page.getByRole('dialog')
  await page.fill('#folder-name-input', V2_FOLDER_NAME)
  await createDialog.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText(`Ο φάκελος «${V2_FOLDER_NAME}» δημιουργήθηκε.`)).toBeVisible()

  const v2FolderRow = page.getByRole('button', { name: V2_FOLDER_NAME, exact: true })
  await v2FolderRow.click()

  await page.getByRole('button', { name: 'Μεταφόρτωση', exact: true }).click()
  const uploadDialog2 = page.getByRole('dialog')
  await uploadDialog2.locator('input[type=file]').setInputFiles({
    name: `${V2_FORCE_ASSET}.png`,
    mimeType: 'image/png',
    buffer: makeSolidPng(40, 40, [60, 200, 90]),
  })
  await expect(page.getByText('1/1 ολοκληρώθηκαν')).toBeVisible({ timeout: 60_000 })
  await page.keyboard.press('Escape')
  await expect(uploadDialog2).toBeHidden()
  await expect(page.getByText(V2_FORCE_ASSET)).toBeVisible()

  await page.getByRole('button', { name: `Ενέργειες για τον φάκελο ${V2_FOLDER_NAME}` }).click()
  await page.getByRole('menuitem', { name: 'Διαγραφή' }).click()

  const forceDeleteDialog = page.getByRole('alertdialog')
  await expect(forceDeleteDialog.getByText(`Διαγραφή φακέλου «${V2_FOLDER_NAME}» ΜΕ όλα τα περιεχόμενά του;`)).toBeVisible()
  await expect(forceDeleteDialog.getByText(/Θα διαγραφούν οριστικά/)).toBeVisible({ timeout: 15_000 })

  const forceDeleteButton = forceDeleteDialog.getByRole('button', { name: 'Διαγραφή', exact: true })
  await expect(forceDeleteButton).toBeDisabled()
  await forceDeleteDialog.getByLabel('Επιβεβαίωση').fill('ΔΙΑΓΡΑΦΗ')
  await expect(forceDeleteButton).toBeEnabled()
  await forceDeleteButton.click()

  await expect(page.getByText(`Ο φάκελος «${V2_FOLDER_NAME}» διαγράφηκε μαζί με 1 αρχείο.`)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: V2_FOLDER_NAME, exact: true })).toBeHidden()
})
