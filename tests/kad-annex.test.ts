import { describe, it, expect, vi } from 'vitest'

// Μητρώο: κάθε 8ψήφιος υποψήφιος που ξεκινά από 10/52/56 θεωρείται πραγματικός ΚΑΔ.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    kadCode: {
      findMany: async ({ where }: { where: { codeWithoutDots: { in: string[] } } }) =>
        where.codeWithoutDots.in.filter(d => /^(10|52|56)\d{6}$/.test(d)).map(d => ({ code: d.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1.$2.$3.$4'), title: 'x', description: null })),
      count: async () => 1000,
    },
  },
}))
import { kadAnnexFromText } from '@/lib/programs/kad-extract'

const rows = (n: number, prefix = '10.11') => Array.from({ length: n }, (_, i) => `${prefix}.${String(10 + (i % 80)).padStart(2, '0')}.${String(i % 99).padStart(2, '0')} Περιγραφή δραστηριότητας`).join(' ')

describe('παράρτημα επιλέξιμων ΚΑΔ από όλο τον οδηγό', () => {
  it('επικεφαλίδα με τόνους/λατινικό E και αναφορές σε άλλα παραρτήματα μέσα στη λίστα', async () => {
    const text = `Εισαγωγή… Παράρτημα ΙΙΙ EΠΙΛΕΞΙΜΕΣ ΔΡΑΣΤΗΡΙΟΤΗΤΕΣ (ΚΑΔ) Οι επιλέξιμες… ${rows(60)} βλ. ΠΑΡΑΡΤΗΜΑ IV: κάτι ${rows(60, '52.21')} ${'κείμενο '.repeat(1500)} ΠΑΡΑΡΤΗΜΑ IV: ΠΑΡΑΔΟΤΕΑ 56.30.00.04`
    const r = await kadAnnexFromText(text)
    expect(r?.some(k => k.code.startsWith('52.21'))).toBe(true)
    expect(r?.some(k => k.code === '56.30.00.04')).toBe(false) // μετά το κενό = άλλο παράρτημα
  })
  it('«ΜΗ ΕΠΙΛΕΞΙΜΟΙ» αγνοείται', async () => {
    expect(await kadAnnexFromText(`ΠΑΡΑΡΤΗΜΑ Β: ΜΗ ΕΠΙΛΕΞΙΜΟΙ ΚΑΔ ${rows(60)}`)).toBeNull()
  })
  it('πλήρης ονοματολογία (>40% του μητρώου) δεν θεωρείται λίστα επιλέξιμων', async () => {
    expect(await kadAnnexFromText(`ΠΑΡΑΡΤΗΜΑ Γ – ΕΠΙΛΕΞΙΜΟΙ ΚΑΔ ${rows(800)}`)).toBeNull()
  })
})
