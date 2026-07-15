import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Row = { key: string; value: unknown; updatedAt: Date }
const store = new Map<string, Row>()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => store.get(where.key) ?? null),
      upsert: vi.fn(async ({ where, update, create }: { where: { key: string }; update: { value: unknown }; create: Row }) => {
        const existing = store.get(where.key)
        const row: Row = existing
          ? { ...existing, value: update.value, updatedAt: new Date() }
          : { key: create.key, value: create.value, updatedAt: new Date() }
        store.set(where.key, row)
        return row
      }),
    },
  },
}))

import {
  getSetting, setSetting, getIntegration, getIntegrationRaw, saveIntegration, saveLastCheck, maskSecret,
  isIntegrationConfigured,
} from '@/lib/settings'

const ENV_KEYS = ['S1_SERIAL', 'S1_USERNAME', 'S1_PASSWORD', 'S1_APP_ID', 'BUNNY_STORAGE_ZONE', 'DEEPSEEK_API_KEY']

beforeEach(() => {
  store.clear()
  for (const k of ENV_KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('getSetting / setSetting', () => {
  it('returns null for a key that has never been saved', async () => {
    expect(await getSetting('nope')).toBeNull()
  })

  it('roundtrips an arbitrary Json value', async () => {
    await setSetting('company.profile', { name: 'Damask', logos: [{ assetId: 'a1', url: '/x.png', label: 'Κύριο' }] })
    expect(await getSetting('company.profile')).toEqual({
      name: 'Damask',
      logos: [{ assetId: 'a1', url: '/x.png', label: 'Κύριο' }],
    })
  })

  it('setSetting upserts — a second call overwrites, not merges', async () => {
    await setSetting('k', { a: 1, b: 2 })
    await setSetting('k', { a: 99 })
    expect(await getSetting('k')).toEqual({ a: 99 })
  })
})

describe('getIntegration — DB→env fallback merge', () => {
  it('falls back to the matching .env var when the DB has no saved value', async () => {
    process.env.S1_SERIAL = 'demo-serial'
    const cfg = await getIntegration<{ serial?: string }>('softone')
    expect(cfg.serial).toBe('demo-serial')
  })

  it('a saved DB value wins over the env fallback', async () => {
    process.env.S1_SERIAL = 'env-serial'
    await setSetting('integration.softone', { serial: 'db-serial' })
    const cfg = await getIntegration<{ serial?: string }>('softone')
    expect(cfg.serial).toBe('db-serial')
  })

  it('an empty-string DB value is treated as unset — still falls back to env', async () => {
    process.env.S1_SERIAL = 'env-serial'
    await setSetting('integration.softone', { serial: '' })
    const cfg = await getIntegration<{ serial?: string }>('softone')
    expect(cfg.serial).toBe('env-serial')
  })

  it('fields with no .env counterpart are left untouched by the merge', async () => {
    await setSetting('integration.softone', { company: '1000' })
    const cfg = await getIntegration<{ company?: string; serial?: string }>('softone')
    expect(cfg.company).toBe('1000')
    expect(cfg.serial).toBeUndefined()
  })

  it('integrations without an existing .env (mailgun/claude/gtags/facebook) are DB-only', async () => {
    expect(await getIntegration('mailgun')).toEqual({})
    await setSetting('integration.mailgun', { domain: 'mg.example.com' })
    expect(await getIntegration('mailgun')).toEqual({ domain: 'mg.example.com' })
  })
})

describe('getIntegrationRaw', () => {
  it('returns the DB value with no env merge applied', async () => {
    process.env.S1_SERIAL = 'env-serial'
    expect(await getIntegrationRaw('softone')).toEqual({})
    await setSetting('integration.softone', { company: '1000' })
    expect(await getIntegrationRaw('softone')).toEqual({ company: '1000' })
  })
})

describe('saveIntegration — secret "empty = keep existing" convention', () => {
  it('saves a brand-new integration as-is', async () => {
    await saveIntegration('mailgun', { apiKey: 'key1', domain: 'mg.example.com' }, ['apiKey'])
    expect(await getSetting('integration.mailgun')).toEqual({ apiKey: 'key1', domain: 'mg.example.com' })
  })

  it('an empty secret field keeps the previously saved secret', async () => {
    await saveIntegration('mailgun', { apiKey: 'key1', domain: 'mg.example.com' }, ['apiKey'])
    await saveIntegration('mailgun', { apiKey: '', domain: 'mg2.example.com' }, ['apiKey'])
    expect(await getSetting('integration.mailgun')).toEqual({ apiKey: 'key1', domain: 'mg2.example.com' })
  })

  it('a non-empty secret field overwrites the previous value', async () => {
    await saveIntegration('mailgun', { apiKey: 'key1' }, ['apiKey'])
    await saveIntegration('mailgun', { apiKey: 'key2' }, ['apiKey'])
    expect((await getSetting<{ apiKey: string }>('integration.mailgun'))!.apiKey).toBe('key2')
  })

  it('a non-secret field CAN be cleared with an empty string (no special-casing)', async () => {
    await saveIntegration('bunny', { s3Endpoint: 'https://de-s3.storage.bunnycdn.com' }, [])
    await saveIntegration('bunny', { s3Endpoint: '' }, [])
    expect((await getSetting<{ s3Endpoint: string }>('integration.bunny'))!.s3Endpoint).toBe('')
  })

  it('preserves _lastCheck across an unrelated save', async () => {
    await setSetting('integration.claude', { apiKey: 'a', _lastCheck: { ok: true, message: 'ok', at: '2026-01-01T00:00:00.000Z' } })
    await saveIntegration('claude', { apiKey: '', model: 'claude-fable-5' }, ['apiKey'])
    const row = await getSetting<{ apiKey: string; _lastCheck: unknown }>('integration.claude')
    expect(row!.apiKey).toBe('a')
    expect(row!._lastCheck).toEqual({ ok: true, message: 'ok', at: '2026-01-01T00:00:00.000Z' })
  })
})

describe('saveLastCheck', () => {
  it('merges _lastCheck into the existing saved value without touching other fields', async () => {
    await setSetting('integration.deepseek', { apiKey: 'x', model: 'deepseek-chat' })
    const result = await saveLastCheck('deepseek', { ok: true, message: 'Επιτυχής σύνδεση.' })
    expect(result.ok).toBe(true)
    expect(typeof result.at).toBe('string')
    expect(new Date(result.at).toString()).not.toBe('Invalid Date')

    const row = await getSetting<{ apiKey: string; model: string; _lastCheck: unknown }>('integration.deepseek')
    expect(row!.apiKey).toBe('x')
    expect(row!.model).toBe('deepseek-chat')
    expect(row!._lastCheck).toEqual(result)
  })

  it('works even when the integration has never been saved before', async () => {
    const result = await saveLastCheck('bunny', { ok: false, message: 'Λείπουν στοιχεία.' })
    expect(await getSetting('integration.bunny')).toEqual({ _lastCheck: result })
  })
})

describe('maskSecret', () => {
  it('returns null for empty, whitespace-only, or missing values', () => {
    expect(maskSecret(undefined)).toBeNull()
    expect(maskSecret(null)).toBeNull()
    expect(maskSecret('')).toBeNull()
    expect(maskSecret('   ')).toBeNull()
  })

  it('shows only the last 4 characters for long secrets', () => {
    const secret = 'sk-c54b0d7a6af94da7a0c519c8874184ec'
    const masked = maskSecret(secret)!
    const last4 = secret.slice(-4)
    expect(masked.endsWith(last4)).toBe(true)
    expect(masked.slice(0, -4)).toMatch(/^•+$/) // ό,τι προηγείται των τελευταίων 4 είναι αποκλειστικά bullets
    expect(masked).not.toContain(secret.slice(0, -4)) // το υπόλοιπο του secret δεν διαρρέει πουθενά
  })

  it('masks short (<=4 char) secrets fully rather than leaking them', () => {
    expect(maskSecret('ab12')).toBe('••••')
    expect(maskSecret('x')).toBe('•')
  })
})

describe('isIntegrationConfigured', () => {
  it('softone requires serial + username + password + appId', () => {
    expect(isIntegrationConfigured('softone', {})).toBe(false)
    expect(isIntegrationConfigured('softone', { serial: 's', username: 'u', password: 'p' })).toBe(false)
    expect(isIntegrationConfigured('softone', { serial: 's', username: 'u', password: 'p', appId: 'a' })).toBe(true)
  })

  it('deepseek/claude only require apiKey', () => {
    expect(isIntegrationConfigured('deepseek', {})).toBe(false)
    expect(isIntegrationConfigured('deepseek', { apiKey: 'k' })).toBe(true)
    expect(isIntegrationConfigured('claude', { apiKey: 'k' })).toBe(true)
  })

  it('gtags is configured when EITHER gtagId or gtmId is set (not both required)', () => {
    expect(isIntegrationConfigured('gtags', {})).toBe(false)
    expect(isIntegrationConfigured('gtags', { gtagId: 'G-XXXX' })).toBe(true)
    expect(isIntegrationConfigured('gtags', { gtmId: 'GTM-XXXX' })).toBe(true)
  })

  it('facebook requires pixelId (appId is optional)', () => {
    expect(isIntegrationConfigured('facebook', {})).toBe(false)
    expect(isIntegrationConfigured('facebook', { pixelId: '123456' })).toBe(true)
  })
})
