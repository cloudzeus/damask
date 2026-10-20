import { describe, it, expect } from 'vitest'
import { mergeExtractedPrograms } from '@/lib/programs/merge-extracted'
import { emptyExtractedProgram } from '@/lib/programs/types'

const base = () => ({ ...emptyExtractedProgram(), title: 'Πρόγραμμα', fundingRate: 50, kadRule: 'ONLY_LISTED', kads: [{ code: '55.10' }], regions: [{ name: 'Νότιο Αιγαίο' }], criteria: [{ name: 'Βιωσιμότητα', weight: 20 }] })

describe('συνδυαστική αποδελτίωση (πρώτος + επόμενος οδηγός)', () => {
  it('ο επόμενος οδηγός ΣΥΜΠΛΗΡΩΝΕΙ τις λίστες — δεν τις σβήνει', () => {
    const next = { ...emptyExtractedProgram(), kadRule: 'UNSPECIFIED', kads: [{ code: '56.10' }, { code: '55.10', description: 'Ξενοδοχεία' }], criteria: [{ name: 'βιωσιμότητα', weight: 25 }] }
    const m = mergeExtractedPrograms(base(), next)
    expect(m.kads.map(k => k.code)).toEqual(['55.10', '56.10'])
    expect(m.kads[0].description).toBe('Ξενοδοχεία')
    expect(m.regions).toHaveLength(1)
    expect(m.criteria).toEqual([{ name: 'Βιωσιμότητα', weight: 25 }])
    expect(m.kadRule).toBe('ONLY_LISTED')
  })
  it('κενές τιμές του επόμενου δεν σβήνουν τις προηγούμενες· μη κενές υπερισχύουν', () => {
    const m = mergeExtractedPrograms(base(), { ...emptyExtractedProgram(), fundingRate: 60 })
    expect(m.title).toBe('Πρόγραμμα')
    expect(m.fundingRate).toBe(60)
  })
  it('χωρίς προηγούμενη αποδελτίωση → ο νέος αυτούσιος', () => {
    const n = base()
    expect(mergeExtractedPrograms(null, n)).toBe(n)
  })
})
