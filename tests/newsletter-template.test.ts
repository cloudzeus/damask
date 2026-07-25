import { describe, it, expect } from 'vitest'
import {
  newsletterHtml,
  newsletterSubject,
  daysUntil,
  formatBudgetShort,
  type NewsletterProgram,
} from '@/lib/prospects/newsletter-template'

const NOW = new Date('2026-07-25T10:00:00Z')

const FULL: NewsletterProgram = {
  title: 'Ψηφιακός Μετασχηματισμός ΜμΕ',
  summary: 'Επιδότηση εξοπλισμού πληροφορικής και λογισμικού.',
  referenceCode: '089ΚΕ',
  submissionEnd: new Date('2026-08-10T00:00:00Z'),
  fundingRate: 50,
  totalBudget: 400_000_000,
  durationMonths: 18,
}

const MINIMAL: NewsletterProgram = {
  title: 'Πρόγραμμα Χ',
  summary: null,
  referenceCode: null,
  submissionEnd: null,
  fundingRate: null,
  totalBudget: null,
  durationMonths: null,
}

describe('newsletterSubject', () => {
  it('βάζει το ποσοστό ενίσχυσης στο θέμα όταν υπάρχει', () => {
    expect(newsletterSubject(FULL)).toBe('Ευκαιρία χρηματοδότησης: Ψηφιακός Μετασχηματισμός ΜμΕ — επιδότηση έως 50%')
  })
  it('χωρίς fundingRate μένει σκέτος ο τίτλος', () => {
    expect(newsletterSubject(MINIMAL)).toBe('Ευκαιρία χρηματοδότησης: Πρόγραμμα Χ')
  })
})

describe('daysUntil', () => {
  it('μετρά ημερολογιακές ημέρες με ceil, null χωρίς προθεσμία', () => {
    expect(daysUntil(new Date('2026-08-10T00:00:00Z'), NOW)).toBe(16)
    expect(daysUntil(null, NOW)).toBeNull()
    expect(daysUntil(new Date('2026-07-20T00:00:00Z'), NOW)!).toBeLessThan(0)
  })
})

describe('formatBudgetShort', () => {
  it('συμπυκνώνει εκατομμύρια/δισεκατομμύρια', () => {
    expect(formatBudgetShort(400_000_000)).toBe('400 εκατ. €')
    expect(formatBudgetShort(1_500_000_000)).toBe('1,5 δισ. €')
    expect(formatBudgetShort(250_000)).toBe('250.000 €')
  })
})

describe('newsletterHtml', () => {
  it('πλήρες πρόγραμμα: όνομα, stats, προθεσμία με αντίστροφη μέτρηση, CTA link', () => {
    const html = newsletterHtml('Δείγμα Επωνυμίας Α.Ε.', FULL, 'https://x.gr/go/tok', NOW)
    expect(html).toContain('Δείγμα Επωνυμίας Α.Ε.')
    expect(html).toContain('Ψηφιακός Μετασχηματισμός ΜμΕ')
    expect(html).toContain('έως 50%')
    expect(html).toContain('400 εκατ. €')
    expect(html).toContain('18 μήνες')
    expect(html).toContain('089ΚΕ')
    expect(html).toContain('απομένουν μόλις <b>16 ημέρες</b>')
    expect(html).toContain('href="https://x.gr/go/tok"')
    expect(html).toContain('Θέλω δωρεάν προαξιολόγηση')
  })

  it('minimal πρόγραμμα: χωρίς stats/προθεσμία/κωδικό, χωρίς κενά artifacts', () => {
    const html = newsletterHtml('Α', MINIMAL, 'https://x.gr/go/t', NOW)
    expect(html).not.toContain('Επιδοτηση')
    expect(html).not.toContain('Οι αιτήσεις κλείνουν')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('null')
  })

  it('χωρίς countdown όταν η προθεσμία απέχει >30 ημέρες', () => {
    const html = newsletterHtml('Α', { ...FULL, submissionEnd: new Date('2026-12-31T00:00:00Z') }, 'https://x.gr/go/t', NOW)
    expect(html).toContain('Οι αιτήσεις κλείνουν')
    expect(html).not.toContain('απομένουν μόλις')
  })

  it('κάνει escape σε επωνυμία και URL', () => {
    const html = newsletterHtml('<script>alert(1)</script>', FULL, 'https://x.gr/go/t?a=1&b="2"', NOW)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;b=&quot;2&quot;')
  })
})
