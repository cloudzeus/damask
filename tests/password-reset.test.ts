import { describe, it, expect, vi, beforeEach } from 'vitest'

type FakeToken = {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
}

const store: { tokens: FakeToken[] } = { tokens: [] }
let nextId = 1

vi.mock('@/lib/prisma', () => ({
  prisma: {
    passwordResetToken: {
      create: vi.fn(async ({ data }: { data: Omit<FakeToken, 'id' | 'usedAt'> }) => {
        const row: FakeToken = { id: `t${nextId++}`, usedAt: null, ...data }
        store.tokens.push(row)
        return row
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        store.tokens.find(t => t.tokenHash === where.tokenHash) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeToken> }) => {
        const row = store.tokens.find(t => t.id === where.id)
        if (!row) throw new Error('not found')
        Object.assign(row, data)
        return row
      }),
    },
    user: {
      findUnique: vi.fn(),
    },
    // requestPasswordReset() πλέον ελέγχει isMailerConfigured() (src/lib/mailer.ts →
    // getIntegration('mailgun') → prisma.setting) πριν αποφασίσει αν στέλνει email ή
    // κάνει fallback σε console.log — καμία ρύθμιση Mailgun σε αυτά τα tests.
    setting: {
      findUnique: vi.fn(async () => null),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { createResetToken, verifyResetToken, consumeResetToken } from '@/lib/password-reset'
import { requestPasswordReset } from '@/app/forgot-password/actions'

beforeEach(() => {
  store.tokens = []
  nextId = 1
  vi.mocked(prisma.user.findUnique).mockReset()
})

describe('createResetToken / verifyResetToken', () => {
  it('δημιουργεί token με hash (όχι raw) και verifyResetToken το αναγνωρίζει', async () => {
    const raw = await createResetToken('user-1')
    expect(store.tokens).toHaveLength(1)
    expect(store.tokens[0].tokenHash).not.toBe(raw)

    const result = await verifyResetToken(raw)
    expect(result).toMatchObject({ ok: true, userId: 'user-1' })
  })

  it('απορρίπτει άγνωστο token', async () => {
    const result = await verifyResetToken('does-not-exist')
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('απορρίπτει ληγμένο token', async () => {
    const raw = await createResetToken('user-1')
    store.tokens[0].expiresAt = new Date(Date.now() - 1000)
    const result = await verifyResetToken(raw)
    expect(result).toEqual({ ok: false, reason: 'expired' })
  })

  it('απορρίπτει ήδη χρησιμοποιημένο token', async () => {
    const raw = await createResetToken('user-1')
    const first = await verifyResetToken(raw)
    if (!first.ok) throw new Error('expected ok')
    await consumeResetToken(first.tokenId)
    const result = await verifyResetToken(raw)
    expect(result).toEqual({ ok: false, reason: 'used' })
  })
})

describe('requestPasswordReset()', () => {
  it('άγνωστο email → γενικό μήνυμα επιτυχίας, ΧΩΡΙΣ δημιουργία token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const form = new FormData()
    form.set('email', 'unknown@nowhere.gr')

    const res = await requestPasswordReset(undefined, form)

    expect(res.submitted).toBe(true)
    expect(res.message).toBe('Αν το email υπάρχει, θα λάβεις σύνδεσμο επαναφοράς.')
    expect(store.tokens).toHaveLength(0)
  })

  it('γνωστό (ενεργό) email → ίδιο γενικό μήνυμα, ΔΗΜΙΟΥΡΓΕΙ hashed token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-42',
      email: 'a@b.gr',
      active: true,
    } as never)
    const form = new FormData()
    form.set('email', 'a@b.gr')

    const res = await requestPasswordReset(undefined, form)

    expect(res.submitted).toBe(true)
    expect(res.message).toBe('Αν το email υπάρχει, θα λάβεις σύνδεσμο επαναφοράς.')
    expect(store.tokens).toHaveLength(1)
    expect(store.tokens[0].userId).toBe('user-42')
  })

  it('ανενεργό email → ίδιο γενικό μήνυμα, ΧΩΡΙΣ token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-9',
      email: 'inactive@b.gr',
      active: false,
    } as never)
    const form = new FormData()
    form.set('email', 'inactive@b.gr')

    const res = await requestPasswordReset(undefined, form)

    expect(res.submitted).toBe(true)
    expect(store.tokens).toHaveLength(0)
  })
})
