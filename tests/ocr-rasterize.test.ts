import { describe, it, expect } from 'vitest'
import { isPdfFile, normalizeImageMimeType, MAX_RASTERIZE_PAGES } from '@/lib/ocr/rasterize'

// rasterize.ts is CLIENT-SIDE ONLY (pdfjs-dist + OffscreenCanvas/FileReader — browser APIs
// not available under vitest's node environment). Only the pure, environment-independent
// helpers are unit-tested here; the actual PDF→image pipeline is verified manually in a
// real browser (see report) and covered by e2e/ocr-demo.spec.ts at the UI level.

function file(name: string, type: string): File {
  return new File(['x'], name, { type })
}

describe('isPdfFile', () => {
  it('recognizes a correctly-typed PDF', () => {
    expect(isPdfFile(file('invoice.pdf', 'application/pdf'))).toBe(true)
  })
  it('recognizes a PDF by extension when the mimeType is missing/wrong (common with scanners)', () => {
    expect(isPdfFile(file('scan.pdf', ''))).toBe(true)
    expect(isPdfFile(file('scan.PDF', 'application/octet-stream'))).toBe(true)
  })
  it('rejects images', () => {
    expect(isPdfFile(file('photo.jpg', 'image/jpeg'))).toBe(false)
  })
})

describe('normalizeImageMimeType', () => {
  it('trusts a correct mimeType for jpg/png/webp', () => {
    expect(normalizeImageMimeType(file('a.jpg', 'image/jpeg'))).toBe('image/jpeg')
    expect(normalizeImageMimeType(file('a.png', 'image/png'))).toBe('image/png')
    expect(normalizeImageMimeType(file('a.webp', 'image/webp'))).toBe('image/webp')
  })
  it('falls back to file extension when mimeType is empty/wrong', () => {
    expect(normalizeImageMimeType(file('photo.jpeg', ''))).toBe('image/jpeg')
    expect(normalizeImageMimeType(file('photo.JPG', 'application/octet-stream'))).toBe('image/jpeg')
    expect(normalizeImageMimeType(file('scan.PNG', ''))).toBe('image/png')
  })
  it('returns null for an unsupported type (e.g. PDF, or a random binary)', () => {
    expect(normalizeImageMimeType(file('doc.pdf', 'application/pdf'))).toBeNull()
    expect(normalizeImageMimeType(file('file.heic', 'image/heic'))).toBeNull()
  })
})

describe('MAX_RASTERIZE_PAGES', () => {
  it('is the documented cap of 4 pages', () => {
    expect(MAX_RASTERIZE_PAGES).toBe(4)
  })
})
