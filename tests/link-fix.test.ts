import { describe, it, expect } from 'vitest'
import { fixInternalLinks } from '@/lib/seo-content/link-fix'

const valid = { programs: ['enischysi-mme-se-tomeis-stratigikon-technologion-gia-tin-eyropi-step-k'], posts: ['de-minimis-2026'] }
describe('fixInternalLinks', () => {
  it('διορθώνει λάθος slug στο πιο κοντινό πραγματικό', () => {
    const r = fixInternalLinks('[STEP](/programmata/enischysi-mme-se-tomeis-stratigon-technologion-gia-tin-eyropi-step-k)', valid)
    expect(r.body).toBe('[STEP](/programmata/enischysi-mme-se-tomeis-stratigikon-technologion-gia-tin-eyropi-step-k)')
    expect(r.fixed).toBe(1)
  })
  it('άγνωστο → λίστα· σωστά μένουν ως έχουν', () => {
    expect(fixInternalLinks('[x](/nea/kati-allo-entelos) [y](/nea/de-minimis-2026) [z](/programmata/nea-2026)', valid).body)
      .toBe('[x](/nea) [y](/nea/de-minimis-2026) [z](/programmata/nea-2026)')
  })
})
