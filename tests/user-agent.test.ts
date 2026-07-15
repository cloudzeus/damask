import { describe, it, expect } from 'vitest'
import { parseUserAgent } from '@/lib/user-agent'

const UA = {
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
}

describe('parseUserAgent', () => {
  it('Windows + Chrome', () => {
    expect(parseUserAgent(UA.windowsChrome)).toEqual({ os: 'Windows', browser: 'Chrome' })
  })

  it('Windows + Edge (το Edge UA περιέχει και "Chrome/" — πρέπει να κερδίζει το Edge)', () => {
    expect(parseUserAgent(UA.windowsEdge)).toEqual({ os: 'Windows', browser: 'Edge' })
  })

  it('macOS + Safari', () => {
    expect(parseUserAgent(UA.macSafari)).toEqual({ os: 'macOS', browser: 'Safari' })
  })

  it('iOS + Safari (το iOS UA περιέχει "like Mac OS X" — πρέπει να κερδίζει το iOS, όχι macOS)', () => {
    expect(parseUserAgent(UA.iosSafari)).toEqual({ os: 'iOS', browser: 'Safari' })
  })

  it('Android + Chrome (το Android UA περιέχει "Linux" — πρέπει να κερδίζει το Android, όχι Linux)', () => {
    expect(parseUserAgent(UA.androidChrome)).toEqual({ os: 'Android', browser: 'Chrome' })
  })

  it('Linux + Firefox', () => {
    expect(parseUserAgent(UA.linuxFirefox)).toEqual({ os: 'Linux', browser: 'Firefox' })
  })

  it('άγνωστο/κενό user agent → "Άγνωστο" OS, null browser', () => {
    expect(parseUserAgent('')).toEqual({ os: 'Άγνωστο', browser: null })
    expect(parseUserAgent(null)).toEqual({ os: 'Άγνωστο', browser: null })
    expect(parseUserAgent(undefined)).toEqual({ os: 'Άγνωστο', browser: null })
    expect(parseUserAgent('SomeBot/1.0')).toEqual({ os: 'Άγνωστο', browser: null })
  })
})
