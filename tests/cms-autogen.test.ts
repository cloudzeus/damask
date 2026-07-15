import { describe, it, expect } from 'vitest'
import {
  buildArticleGenerationMessages, parseGeneratedArticle, TONE_LABELS, LENGTH_LABELS, BRAND_NAME,
} from '@/lib/cms-autogen'

describe('buildArticleGenerationMessages', () => {
  it('περιέχει το brand, το tone label και το length label στα μηνύματα', () => {
    const messages = buildArticleGenerationMessages({
      topic: 'Πώς να διαλέξετε ύφασμα ταπετσαρίας',
      tone: 'informative',
      length: 'medium',
    })
    const combined = messages.map(m => m.content).join('\n')

    expect(combined).toContain(BRAND_NAME)
    expect(combined).toContain(TONE_LABELS.informative)
    expect(combined).toContain(LENGTH_LABELS.medium)
  })

  it('περιλαμβάνει system + user μήνυμα, με το θέμα μέσα στο user μήνυμα', () => {
    const messages = buildArticleGenerationMessages({
      topic: 'Τάσεις επίπλωσης 2026',
      tone: 'commercial',
      length: 'short',
    })

    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('Τάσεις επίπλωσης 2026')
  })

  it('αναφέρει SEO και GEO στις οδηγίες (system message)', () => {
    const [system] = buildArticleGenerationMessages({ topic: 'x', tone: 'technical', length: 'long' })
    expect(system.content).toMatch(/SEO/)
    expect(system.content).toMatch(/GEO/)
  })

  it('περνάει το όνομα κατηγορίας όταν δίνεται', () => {
    const messages = buildArticleGenerationMessages({
      topic: 'x', tone: 'informative', length: 'short', categoryName: 'Ταπετσαρίες',
    })
    expect(messages[0].content).toContain('Ταπετσαρίες')
  })

  it('χρησιμοποιεί το companyContext όταν δίνεται, αλλιώς το προεπιλεγμένο πλαίσιο Damask', () => {
    const withContext = buildArticleGenerationMessages({
      topic: 'x', tone: 'informative', length: 'short', companyContext: 'Damask Α.Ε. — υφάσματα ξενοδοχείων',
    })
    expect(withContext[0].content).toContain('Damask Α.Ε. — υφάσματα ξενοδοχείων')

    const withoutContext = buildArticleGenerationMessages({ topic: 'x', tone: 'informative', length: 'short' })
    expect(withoutContext[0].content).toMatch(/υφασμάτων/)
  })

  it('ζητά JSON απάντηση με τα αναμενόμενα keys', () => {
    const [system] = buildArticleGenerationMessages({ topic: 'x', tone: 'informative', length: 'short' })
    expect(system.content).toContain('title')
    expect(system.content).toContain('seoTitle')
    expect(system.content).toContain('seoDescription')
  })
})

describe('parseGeneratedArticle', () => {
  const valid = {
    title: 'Τίτλος',
    excerpt: 'Περίληψη.',
    body: '## Επικεφαλίδα\nΚείμενο.',
    seoTitle: 'SEO τίτλος',
    seoDescription: 'SEO περιγραφή.',
  }

  it('αναλύει καθαρό JSON', () => {
    expect(parseGeneratedArticle(JSON.stringify(valid))).toEqual(valid)
  })

  it('αφαιρεί ```json code fence πριν το parse', () => {
    const fenced = '```json\n' + JSON.stringify(valid) + '\n```'
    expect(parseGeneratedArticle(fenced)).toEqual(valid)
  })

  it('κάνει trim σε whitespace γύρω από τα πεδία', () => {
    const padded = { ...valid, title: '  Τίτλος  ' }
    expect(parseGeneratedArticle(JSON.stringify(padded)).title).toBe('Τίτλος')
  })

  it('πετάει φιλικό σφάλμα για μη έγκυρο JSON', () => {
    expect(() => parseGeneratedArticle('not json at all')).toThrow(/JSON/)
  })

  it('πετάει φιλικό σφάλμα όταν λείπει ένα απαιτούμενο πεδίο', () => {
    const incomplete = { title: valid.title, excerpt: valid.excerpt, body: valid.body, seoTitle: valid.seoTitle }
    expect(() => parseGeneratedArticle(JSON.stringify(incomplete))).toThrow(/seoDescription/)
  })

  it('πετάει σφάλμα όταν ένα πεδίο είναι κενό string', () => {
    expect(() => parseGeneratedArticle(JSON.stringify({ ...valid, body: '   ' }))).toThrow(/body/)
  })

  it('πετάει σφάλμα όταν το JSON είναι array αντί για object', () => {
    expect(() => parseGeneratedArticle(JSON.stringify([valid]))).toThrow()
  })
})
