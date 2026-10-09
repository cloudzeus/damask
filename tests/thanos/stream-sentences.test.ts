import { describe, it, expect } from 'vitest'
import { SentenceFeeder } from '@/lib/voice/stream-sentences'

/** Τροφοδοτεί κείμενο σε μικρά κομμάτια (όπως η ροή) και μαζεύει τι θα εκφωνηθεί. */
function run(text: string, step = 3) {
  const f = new SentenceFeeder()
  const spoken: string[] = []
  let firstAt = -1
  for (let i = 0; i < text.length; i += step) {
    const out = f.feed(text.slice(i, i + step))
    if (out.length && firstAt < 0) firstAt = i + step
    spoken.push(...out)
  }
  spoken.push(...f.flush())
  return { spoken, firstAt, listItems: f.listItems }
}

describe('SentenceFeeder', () => {
  it('η πρώτη πρόταση βγαίνει πριν τελειώσει το κείμενο', () => {
    const text = 'Ναι, μπορεί να μπει στο πρόγραμμα με μια προϋπόθεση. Πρέπει να το χρησιμοποιεί η ίδια η επιχείρηση και όχι τρίτοι. Θέλετε να δούμε πόσο καλύπτεται;'
    const r = run(text)
    expect(r.firstAt).toBeGreaterThan(0)
    expect(r.firstAt).toBeLessThan(text.length / 2)
    expect(r.spoken.join(' ')).toBe(text)
  })
  it('δεν εκφωνεί λίστες ούτε το «…τα εξής:», μετρά τα στοιχεία', () => {
    const r = run('Ετοίμασα το email για τον λογιστή σας, ελέγξτε το και πατήστε Αποστολή. Ζητάμε τα εξής:\n- Ε3 2024\n- **ΕΜΕ** 2025\n1. Ισοζύγιο\n- ΦΕΚ σύστασης')
    expect(r.spoken).toEqual(['Ετοίμασα το email για τον λογιστή σας, ελέγξτε το και πατήστε Αποστολή.'])
    expect(r.listItems).toBe(4)
  })
  it('δεκαδικοί και έντονα δεν σπάνε πρόταση', () => {
    const r = run('Η επιχορήγηση είναι **67,5%** και το όριο 3.5 εκατ. ευρώ για κάθε επιχείρηση. Τέλος.')
    expect(r.spoken.join(' ')).toBe('Η επιχορήγηση είναι 67,5% και το όριο 3.5 εκατ. ευρώ για κάθε επιχείρηση. Τέλος.')
  })
})
