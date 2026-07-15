import { describe, it, expect } from 'vitest'
import { transliterateGreek, slugify, nextSlugCandidate } from '@/lib/slug'

describe('transliterateGreek', () => {
  it('μεταγράφει απλά ελληνικά γράμματα', () => {
    expect(transliterateGreek('θέμα')).toBe('thema')
    expect(transliterateGreek('ψάρι')).toBe('psari')
    expect(transliterateGreek('χαρά')).toBe('chara')
  })

  it('χειρίζεται τα digraphs μπ/ντ/γκ ως ένα «καθημερινό» greeklish block', () => {
    expect(transliterateGreek('μπλε')).toBe('mple')
    expect(transliterateGreek('ντομάτα')).toBe('ntomata')
    expect(transliterateGreek('γκολ')).toBe('gkol')
  })

  it('το αυ/ευ γίνεται af/ef πριν από άφωνο σύμφωνο ή στο τέλος λέξης', () => {
    expect(transliterateGreek('αυτοκίνητο')).toBe('aftokinito')
    expect(transliterateGreek('εύκολο')).toBe('efkolo')
  })

  it('το αυ/ευ γίνεται av/ev πριν από φωνήεν ή ηχηρό σύμφωνο', () => {
    expect(transliterateGreek('αύριο')).toBe('avrio')
  })

  it('το τελικό ς μεταγράφεται όπως το σ', () => {
    expect(transliterateGreek('κόσμος')).toBe('kosmos')
  })

  it('είναι ανεξάρτητο πεζών/κεφαλαίων', () => {
    expect(transliterateGreek('ΚΑΡΕΚΛΑ')).toBe(transliterateGreek('καρεκλα'))
    expect(transliterateGreek('Θέμα')).toBe('thema')
  })

  it('αφήνει λατινικούς χαρακτήρες, αριθμούς και σημεία στίξης ως έχουν (πεζοποιημένα)', () => {
    expect(transliterateGreek('Hello World! 123')).toBe('hello world! 123')
  })
})

describe('slugify', () => {
  it('παράγει πεζό, ενωμένο με παύλες slug από ελληνικό τίτλο', () => {
    expect(slugify('Καρέκλα Σαλονιού')).toBe('karekla-saloniou')
  })

  it('αφαιρεί σημεία στίξης και συμπτύσσει πολλαπλά διαχωριστικά σε μία παύλα', () => {
    expect(slugify('Καρέκλα -- Σαλονιού!!  2026')).toBe('karekla-saloniou-2026')
  })

  it('κόβει παύλες από την αρχή/τέλος', () => {
    expect(slugify('  -Νέο άρθρο- ')).toBe('neo-arthro')
  })

  it('ποτέ δεν επιστρέφει κενό string — fallback "item" για μόνο-σύμβολα input', () => {
    expect(slugify('!!!')).toBe('item')
    expect(slugify('')).toBe('item')
  })

  it('κόβει υπερβολικά μεγάλα slugs χωρίς να αφήνει κρεμαστή παύλα', () => {
    const long = 'α'.repeat(300)
    const result = slugify(long)
    expect(result.length).toBeLessThanOrEqual(160)
    expect(result.endsWith('-')).toBe(false)
  })

  it('είναι idempotent πάνω σε ήδη-slugified είσοδο', () => {
    const once = slugify('Πολυθρόνα Δερμάτινη')
    expect(slugify(once)).toBe(once)
  })
})

describe('nextSlugCandidate', () => {
  it('η 1η προσπάθεια επιστρέφει το base χωρίς αλλαγή', () => {
    expect(nextSlugCandidate('karekla', 1)).toBe('karekla')
  })

  it('οι επόμενες προσθέτουν -N', () => {
    expect(nextSlugCandidate('karekla', 2)).toBe('karekla-2')
    expect(nextSlugCandidate('karekla', 3)).toBe('karekla-3')
  })
})
