import { describe, it, expect } from 'vitest'
import { linkGlossaryTerms } from '@/lib/seo-content/glossary'

describe('linkGlossaryTerms', () => {
  it('συνδέει μόνο την πρώτη εμφάνιση κάθε όρου σε παραγράφους', () => {
    const md = 'Το όριο de minimis είναι 300.000€. Ξανά de minimis.\n\nΟ ΚΑΔ της επιχείρησης μετράει.'
    const out = linkGlossaryTerms(md)
    expect(out).toContain('[de minimis](/glossari#de-minimis) είναι')
    expect(out.match(/glossari#de-minimis/g)).toHaveLength(1)
    expect(out).toContain('[ΚΑΔ](/glossari#kad)')
  })
  it('δεν αγγίζει τίτλους, λίστες, πίνακες και υπάρχοντες συνδέσμους', () => {
    const md = '## Τι είναι το de minimis\n- ΚΑΔ στη λίστα\n| ΕΜΕ | 3 |\nΔείτε [τον ΚΑΔ σας](/x) εδώ.'
    expect(linkGlossaryTerms(md)).toBe(md)
  })
  it('δεν ταιριάζει μέρος λέξης (π.χ. «ΚΑΔΑ»)', () => {
    expect(linkGlossaryTerms('Η ΚΑΔΑ δεν είναι όρος.')).toBe('Η ΚΑΔΑ δεν είναι όρος.')
  })
})
