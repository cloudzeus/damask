import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/bunny-storage', () => ({ bunnyUploadPrivate: vi.fn() }))
import { evaluable } from '@/lib/import/evaluate'

describe('evaluable — ποια εισερχόμενα αξιολογούνται', () => {
  it('έγγραφα ναι · video/αρχεία συστήματος/πολύ μεγάλα όχι', () => {
    expect(evaluable('ΤΔΑ 14759.pdf', 'application/pdf', 120_000)).toBe(true)
    expect(evaluable('scan.jpg', 'image/jpeg', 900_000)).toBe(true)
    expect(evaluable('Δικαιολογητικά.docx', '', 30_000)).toBe(true)
    expect(evaluable('video.mp4', 'video/mp4', 5_000_000)).toBe(false)
    expect(evaluable('Thumbs.db', '', 10_000)).toBe(false)
    expect(evaluable('~$temp.docx', '', 1_000)).toBe(false)
    expect(evaluable('big.pdf', 'application/pdf', 30 * 1024 * 1024)).toBe(false)
  })
})
