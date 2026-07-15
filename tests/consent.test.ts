import { describe, it, expect } from 'vitest'
import { shouldShowBanner, parseConsentCookie, parseAcceptLanguageLocale } from '@/lib/consent'

const CONFIG = { policyVersion: '2026-07' }

describe('shouldShowBanner', () => {
  it('true όταν δεν υπάρχει καθόλου cookie', () => {
    expect(shouldShowBanner(null, CONFIG)).toBe(true)
    expect(shouldShowBanner(undefined, CONFIG)).toBe(true)
    expect(shouldShowBanner('', CONFIG)).toBe(true)
  })

  it('true όταν το cookie είναι κατεστραμμένο JSON', () => {
    expect(shouldShowBanner('{not-json', CONFIG)).toBe(true)
  })

  it('true όταν λείπει η policyVersion από το αποθηκευμένο cookie', () => {
    expect(shouldShowBanner(JSON.stringify({ analytics: true, marketing: false }), CONFIG)).toBe(true)
  })

  it('false όταν η αποθηκευμένη policyVersion ταιριάζει με την τρέχουσα', () => {
    const cookie = JSON.stringify({ analytics: true, marketing: true, policyVersion: '2026-07' })
    expect(shouldShowBanner(cookie, CONFIG)).toBe(false)
  })

  it('true όταν ο διαχειριστής άλλαξε την policyVersion (version mismatch → νέα συγκατάθεση)', () => {
    const cookie = JSON.stringify({ analytics: true, marketing: true, policyVersion: '2025-01' })
    expect(shouldShowBanner(cookie, CONFIG)).toBe(true)
  })
})

describe('parseConsentCookie', () => {
  it('επιστρέφει τις επιλογές με σωστούς τύπους', () => {
    const cookie = JSON.stringify({ analytics: true, marketing: false, policyVersion: '2026-07' })
    expect(parseConsentCookie(cookie)).toEqual({ analytics: true, marketing: false, policyVersion: '2026-07' })
  })

  it('θεωρεί οποιαδήποτε μη-true τιμή ως false (defensive parsing)', () => {
    const cookie = JSON.stringify({ analytics: 'yes', policyVersion: '2026-07' })
    expect(parseConsentCookie(cookie)).toEqual({ analytics: false, marketing: false, policyVersion: '2026-07' })
  })

  it('null για μη-αντικείμενο JSON', () => {
    expect(parseConsentCookie('42')).toBeNull()
    expect(parseConsentCookie('"hello"')).toBeNull()
  })
})

describe('parseAcceptLanguageLocale', () => {
  it('en για αγγλόφωνο Accept-Language', () => {
    expect(parseAcceptLanguageLocale('en-US,en;q=0.9,el;q=0.8')).toBe('en')
  })

  it('el για ελληνόφωνο Accept-Language', () => {
    expect(parseAcceptLanguageLocale('el-GR,el;q=0.9,en;q=0.8')).toBe('el')
  })

  it('el default όταν λείπει το header', () => {
    expect(parseAcceptLanguageLocale(null)).toBe('el')
    expect(parseAcceptLanguageLocale(undefined)).toBe('el')
    expect(parseAcceptLanguageLocale('')).toBe('el')
  })
})
