import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/settings', () => ({ getIntegration: vi.fn(async () => ({})) }))

import { getIntegration } from '@/lib/settings'
import { sendMail, isMailerConfigured, renderEmailShell } from '@/lib/mailer'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getIntegration).mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('isMailerConfigured', () => {
  it('is false when apiKey/domain/fromEmail are missing', async () => {
    vi.mocked(getIntegration).mockResolvedValue({})
    expect(await isMailerConfigured()).toBe(false)
  })

  it('is true once apiKey, domain and fromEmail are all set', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k', domain: 'mg.example.com', fromEmail: 'a@b.com' })
    expect(await isMailerConfigured()).toBe(true)
  })
})

describe('sendMail', () => {
  it('returns a friendly error result (never throws) when Mailgun is not configured', async () => {
    vi.mocked(getIntegration).mockResolvedValue({})
    const result = await sendMail({ to: 'x@y.com', subject: 'Hi', html: '<p>hi</p>' })
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('builds the correct Mailgun /messages request against the US endpoint by default', async () => {
    vi.mocked(getIntegration).mockResolvedValue({
      apiKey: 'key123', domain: 'mg.example.com', fromEmail: 'noreply@example.com', fromName: 'DAMASK',
    })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 }))

    const result = await sendMail({ to: 'user@example.com', subject: 'Subj', html: '<p>Hello <b>World</b></p>' })

    expect(result).toEqual({ ok: true, id: 'msg-1' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.mailgun.net/v3/mg.example.com/messages')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('api:key123').toString('base64')}`)

    const body = new URLSearchParams(init.body)
    expect(body.get('from')).toBe('DAMASK <noreply@example.com>')
    expect(body.get('to')).toBe('user@example.com')
    expect(body.get('subject')).toBe('Subj')
    expect(body.get('html')).toBe('<p>Hello <b>World</b></p>')
    expect(body.get('text')).toBe('Hello World') // auto-stripped plain-text fallback
  })

  it('uses the EU endpoint when region is "EU"', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k', domain: 'mg.example.com', fromEmail: 'a@b.com', region: 'EU' })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

    await sendMail({ to: 'x@y.com', subject: 's', html: '<p>x</p>' })

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.eu.mailgun.net/v3/mg.example.com/messages')
  })

  it('omits the display name from "from" when fromName is not set', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k', domain: 'mg.example.com', fromEmail: 'a@b.com' })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

    await sendMail({ to: 'x@y.com', subject: 's', html: '<p>x</p>' })

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body)
    expect(body.get('from')).toBe('a@b.com')
  })

  it('respects an explicit text part instead of auto-stripping the html', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k', domain: 'mg.example.com', fromEmail: 'a@b.com' })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

    await sendMail({ to: 'x@y.com', subject: 's', html: '<p>x</p>', text: 'plain text version' })

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body)
    expect(body.get('text')).toBe('plain text version')
  })

  it('returns ok:false with the HTTP status in the message on a non-2xx response', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k', domain: 'mg.example.com', fromEmail: 'a@b.com' })
    fetchMock.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))

    const result = await sendMail({ to: 'x@y.com', subject: 's', html: '<p>x</p>' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/403/)
  })

  it('returns ok:false (not a throw) when fetch rejects with a network error', async () => {
    vi.mocked(getIntegration).mockResolvedValue({ apiKey: 'k', domain: 'mg.example.com', fromEmail: 'a@b.com' })
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))

    const result = await sendMail({ to: 'x@y.com', subject: 's', html: '<p>x</p>' })

    expect(result.ok).toBe(false)
  })
})

describe('renderEmailShell', () => {
  it('includes the heading, body and a CTA link when ctaLabel/ctaUrl are given', () => {
    const html = renderEmailShell({
      heading: 'Επαναφορά κωδικού',
      bodyHtml: '<p>Κάνε κλικ παρακάτω.</p>',
      ctaLabel: 'Επαναφορά κωδικού',
      ctaUrl: 'https://example.com/reset-password?token=abc123',
    })
    expect(html).toContain('Επαναφορά κωδικού')
    expect(html).toContain('Κάνε κλικ παρακάτω.')
    expect(html).toContain('https://example.com/reset-password?token=abc123')
    expect(html).toContain('<a href="https://example.com/reset-password?token=abc123"')
  })

  it('omits the CTA block entirely when no ctaUrl is given', () => {
    const html = renderEmailShell({ heading: 'Τίτλος', bodyHtml: '<p>Σώμα</p>' })
    expect(html).not.toContain('<a href')
  })
})
