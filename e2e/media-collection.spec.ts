import { deflateSync } from 'node:zlib'
import { test, expect } from '@playwright/test'

// ── Ελάχιστος, χωρίς εξαρτήσεις, PNG encoder (συμπαγές χρώμα) ──────────────
// Παράγει ένα έγκυρο PNG (RGB, χωρίς palette) εξ ολοκλήρου in-memory, ώστε το
// test να μη χρειάζεται sharp/κ.λπ. ή fixture αρχεία στο repo.

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
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 2 // color type: truecolor RGB
  ihdrData[10] = 0 // compression method
  ihdrData[11] = 0 // filter method
  ihdrData[12] = 0 // interlace method
  const ihdr = pngChunk('IHDR', ihdrData)

  const rowBytes = width * 3
  const raw = Buffer.alloc((rowBytes + 1) * height)
  const [r, g, b] = rgb
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1)
    raw[rowStart] = 0 // filter type: None
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

const TEST_IMAGES: Array<{ fileName: string; rgb: [number, number, number] }> = [
  { fileName: 'e2e-red.png', rgb: [220, 38, 38] },
  { fileName: 'e2e-green.png', rgb: [22, 163, 74] },
  { fileName: 'e2e-blue.png', rgb: [37, 99, 235] },
]

test('ProductImageCollection: top-anchored hover preview + drag reorder', async ({ page }) => {
  test.setTimeout(90_000) // πραγματικά uploads στο BunnyCDN — δώσε άνεση χρόνου

  await page.goto('/login')
  await page.fill('#email', 'gkozyris@i4ria.com')
  await page.fill('#password', process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/media-demo')
  await expect(page.getByRole('heading', { name: 'Δοκιμή Media Uploader' })).toBeVisible()

  await page.locator('input[type=file]').setInputFiles(
    TEST_IMAGES.map(img => ({
      name: img.fileName,
      mimeType: 'image/png',
      buffer: makeSolidPng(40, 40, img.rgb),
    })),
  )

  await expect(page.getByText('3/3 ολοκληρώθηκαν')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { name: /Συλλογή εικόνων/ })).toBeVisible()

  const avatars = page.locator('button[aria-label^="Εικόνα"]')
  await expect(avatars).toHaveCount(3)

  // ── 1) Hover preview: πρέπει να ανοίγει ΠΑΝΩ από το thumbnail ──────────
  const firstAvatar = avatars.nth(0)
  await firstAvatar.hover()

  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toBeVisible({ timeout: 2000 })
  await page.waitForTimeout(400) // άσε την entrance animation (150ms) να ολοκληρωθεί πριν το screenshot

  const avatarBox = await firstAvatar.boundingBox()
  const tooltipBox = await tooltip.boundingBox()
  if (!avatarBox || !tooltipBox) throw new Error('Λείπει bounding box για avatar/tooltip')

  console.log('avatar box', avatarBox, 'tooltip box', tooltipBox)
  // preview.bottom <= avatar.top (+1px ανοχή για rounding)
  expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(avatarBox.y + 1)
  // οριζόντια κεντραρισμένο (ή clamped στο viewport) — έλεγχος ότι επικαλύπτεται οριζόντια με το avatar
  expect(tooltipBox.x).toBeLessThanOrEqual(avatarBox.x + avatarBox.width)
  expect(tooltipBox.x + tooltipBox.width).toBeGreaterThanOrEqual(avatarBox.x)

  await page.screenshot({ path: 'test-results/media-collection-preview-above.png' })

  // μετακίνηση μακριά ώστε να κλείσει το preview πριν το drag
  await page.mouse.move(10, 10)
  await expect(tooltip).toBeHidden()

  // ── 2) Drag & drop: το 1ο avatar στη θέση του 3ου ──────────────────────
  const orderedBefore = await page.locator('ol > li').allTextContents()

  const box1 = await avatars.nth(0).boundingBox()
  const box3 = await avatars.nth(2).boundingBox()
  if (!box1 || !box3) throw new Error('Λείπει bounding box για drag')

  const start = { x: box1.x + box1.width / 2, y: box1.y + box1.height / 2 }
  const end = { x: box3.x + box3.width, y: box3.y + box3.height / 2 }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      start.x + ((end.x - start.x) * i) / steps,
      start.y + ((end.y - start.y) * i) / steps,
      { steps: 2 },
    )
  }
  await page.mouse.up()

  const orderedAfter = await page.locator('ol > li').allTextContents()
  console.log('order before', orderedBefore, 'order after', orderedAfter)
  expect(orderedAfter).not.toEqual(orderedBefore)
  expect(orderedAfter[0]).not.toEqual(orderedBefore[0])
})
