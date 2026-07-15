import 'dotenv/config'
import { deflateSync } from 'node:zlib'
import { test, expect, type Page } from '@playwright/test'

// ── Ελάχιστος, χωρίς εξαρτήσεις, PNG encoder — ίδιος με e2e/media-gallery.spec.ts ──

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

// ── OCR component (δοκιμή) — /ocr-demo ───────────────────────────────────────
// Ο χρήστης ΔΕΝ έχει δώσει Gemini API key σε αυτό το περιβάλλον, οπότε αυτά τα
// tests επιβεβαιώνουν το ΦΙΛΙΚΟ ERROR PATH (χωρίς πραγματικό Gemini call, ίδιο
// idiom με τα υπόλοιπα connection-tests e2e — δες AGENTS instructions: "ΟΧΙ
// πραγματικό Gemini call στο e2e· ο χρήστης ΔΕΝ έχει δώσει Gemini key — SKIP live").

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)
}

test('sidebar «OCR (δοκιμή)» οδηγεί στο /ocr-demo, το οποίο δείχνει το uploader', async ({ page }) => {
  await loginAsAdmin(page)
  await page.getByRole('link', { name: 'OCR (δοκιμή)' }).click()

  await expect(page).toHaveURL(/\/ocr-demo/)
  await expect(page.getByRole('heading', { name: 'OCR (δοκιμή)' })).toBeVisible()
  await expect(page.getByText('Ανάγνωση παραστατικού')).toBeVisible()
  await expect(page.getByText('Σύρε φωτογραφίες ή PDF εδώ')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ανάγνωση εγγράφου' })).toBeDisabled()
})

test('upload εικόνας ΧΩΡΙΣ Gemini configured → φιλικό μήνυμα σφάλματος, όχι raw error/stack trace', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/ocr-demo')

  await page.locator('input[type=file]').setInputFiles({
    name: 'e2e-ocr-test.png',
    mimeType: 'image/png',
    buffer: makeSolidPng(40, 40, [40, 90, 130]),
  })

  // Το thumbnail φορτώνει client-side (base64 + διαστάσεις) πριν ενεργοποιηθεί το κουμπί.
  const readButton = page.getByRole('button', { name: 'Ανάγνωση εγγράφου' })
  await expect(readButton).toBeEnabled({ timeout: 15_000 })
  await readButton.click()

  // Περνάει από τη φάση «Ανάλυση…» (spinner + βήματα) και επιστρέφει με φιλικό μήνυμα —
  // ΟΧΙ πραγματικό Gemini call, το OCR pipeline εντοπίζει "not configured" τοπικά.
  // (.notice — όχι bare getByRole('alert'): το Next.js route announcer έχει ΚΙ ΑΥΤΟ role="alert".)
  await expect(page.locator('.notice')).toContainText('Ρύθμισε το Google Gemini για OCR εικόνων', { timeout: 20_000 })

  // Επιστρέφει στο upload phase (όχι κολλημένο σε "processing") — ο χρήστης μπορεί να ξαναδοκιμάσει.
  await expect(readButton).toBeVisible()
})
