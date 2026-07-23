import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * vi.mock factories run before any top-level `const` in this file is
 * initialized, so shared mocks are declared via vi.hoisted() (see
 * tests/pm-c2g-materialize.test.ts for the same idiom). We mutate `h.db` /
 * `h.mailer` in place across tests — never reassign the outer object — so
 * every mocked delegate stays reachable from the modules under test.
 */
const h = vi.hoisted(() => ({
  db: {} as any,
  mailer: { isMailerConfigured: vi.fn(), sendMail: vi.fn() },
}))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn().mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', permissions: ['programs.manage'], trdrId: null },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))
// escapeHtml is identity here — this file doesn't assert on HTML escaping,
// only on send/skip/fail counts and lead upsert shape.
vi.mock('@/lib/mailer', () => ({
  isMailerConfigured: h.mailer.isMailerConfigured,
  sendMail: h.mailer.sendMail,
  escapeHtml: (s: string) => s,
}))

import { findProspects, sendProgramNewsletter } from '@/lib/prospects/actions'
import { recordLeadClick } from '@/lib/prospects/click'

function freshDb() {
  h.db.program = {
    findUniqueOrThrow: vi.fn(async () => ({
      title: 'Ψηφιακός Μετασχηματισμός ΜμΕ',
      summary: 'Επιδότηση εξοπλισμού πληροφορικής',
      submissionEnd: new Date('2026-12-31'),
      extractedData: { kadRule: 'UNSPECIFIED' },
      kads: [],
      regions: [],
      legalForms: [],
    })),
  }
  h.db.trdr = { findMany: vi.fn(async () => []) }
  h.db.region = { findMany: vi.fn(async () => []) }
  h.db.programLead = {
    upsert: vi.fn(async ({ where }: any) => ({ id: `lead-${where.programId_trdrId.trdrId}` })),
    update: vi.fn(async () => ({})),
    findUnique: vi.fn(async () => null),
  }
}

beforeEach(() => {
  freshDb()
  h.mailer.isMailerConfigured.mockReset()
  h.mailer.sendMail.mockReset()
})

describe('sendProgramNewsletter', () => {
  it('sends to trdrs with email, skips the one without, upserts SENT leads', async () => {
    h.mailer.isMailerConfigured.mockResolvedValue(true)
    h.mailer.sendMail.mockResolvedValue({ ok: true, id: 'mg-1' })
    h.db.trdr.findMany = vi.fn(async () => [
      { id: 't1', NAME: 'Άλφα ΑΕ', EMAIL: 'a@example.com' },
      { id: 't2', NAME: 'Βήτα ΙΚΕ', EMAIL: 'b@example.com' },
      { id: 't3', NAME: 'Γάμμα χωρίς email', EMAIL: null },
    ])

    const result = await sendProgramNewsletter('prog-1', ['t1', 't2', 't3'])

    expect(result).toEqual({ sent: 2, skipped: 1, failed: 0 })
    expect(h.mailer.sendMail).toHaveBeenCalledTimes(2)
    expect(h.db.programLead.upsert).toHaveBeenCalledTimes(2)
    for (const call of h.db.programLead.upsert.mock.calls) {
      expect(call[0].create.status).toBe('SENT')
      expect(call[0].update.status).toBe('SENT')
    }
    // no lead touched for the recipient without an email
    const upsertedTrdrIds = h.db.programLead.upsert.mock.calls.map((c: any) => c[0].where.programId_trdrId.trdrId)
    expect(upsertedTrdrIds).toEqual(expect.arrayContaining(['t1', 't2']))
    expect(upsertedTrdrIds).not.toContain('t3')
  })

  it('mailer not configured → no-op, no queries beyond the config check', async () => {
    h.mailer.isMailerConfigured.mockResolvedValue(false)
    h.db.trdr.findMany = vi.fn(async () => [{ id: 't1', NAME: 'Άλφα ΑΕ', EMAIL: 'a@example.com' }])

    const result = await sendProgramNewsletter('prog-1', ['t1'])

    expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 })
    expect(h.mailer.sendMail).not.toHaveBeenCalled()
    expect(h.db.programLead.upsert).not.toHaveBeenCalled()
  })

  it('isolates a per-recipient send failure — the other recipient still succeeds', async () => {
    h.mailer.isMailerConfigured.mockResolvedValue(true)
    h.mailer.sendMail
      .mockResolvedValueOnce({ ok: false, error: 'Mailgun HTTP 500' })
      .mockResolvedValueOnce({ ok: true, id: 'mg-2' })
    h.db.trdr.findMany = vi.fn(async () => [
      { id: 't1', NAME: 'Άλφα ΑΕ', EMAIL: 'a@example.com' },
      { id: 't2', NAME: 'Βήτα ΙΚΕ', EMAIL: 'b@example.com' },
    ])

    const result = await sendProgramNewsletter('prog-1', ['t1', 't2'])

    expect(result).toEqual({ sent: 1, skipped: 0, failed: 1 })
    expect(h.db.programLead.upsert).toHaveBeenCalledTimes(2)
    expect(h.db.programLead.update).toHaveBeenCalledTimes(1)
    expect(h.db.programLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    )
  })

  it('a per-recipient exception (sendMail throws) is also isolated as failed', async () => {
    h.mailer.isMailerConfigured.mockResolvedValue(true)
    h.mailer.sendMail
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, id: 'mg-3' })
    h.db.trdr.findMany = vi.fn(async () => [
      { id: 't1', NAME: 'Άλφα ΑΕ', EMAIL: 'a@example.com' },
      { id: 't2', NAME: 'Βήτα ΙΚΕ', EMAIL: 'b@example.com' },
    ])

    const result = await sendProgramNewsletter('prog-1', ['t1', 't2'])

    expect(result).toEqual({ sent: 1, skipped: 0, failed: 1 })
  })
})

describe('findProspects', () => {
  it('evaluates every active customer Trdr against the selected criteria', async () => {
    h.db.program.findUniqueOrThrow = vi.fn(async () => ({
      extractedData: { kadRule: 'ONLY_LISTED' },
      kads: [{ code: '62.01' }],
      regions: [{ name: 'Αττική' }],
      legalForms: [{ name: 'ΙΚΕ' }],
    }))
    h.db.trdr.findMany = vi.fn(async () => [
      // eligible on all 3: kad prefix-matches, region matches (via level-3 climb), legal form canonicalises to ΙΚΕ
      { id: 't1', NAME: 'Άλφα', EMAIL: 'a@example.com', appLegalForm: 'Ι.Κ.Ε.', regionCode: 'R5', kads: [{ code: '62.01.11' }] },
      // fails kad (unrelated code) and legal form (ΑΕ not allowed)
      { id: 't2', NAME: 'Βήτα', EMAIL: 'b@example.com', appLegalForm: 'Α.Ε.', regionCode: 'R5', kads: [{ code: '99.99' }] },
    ])
    h.db.region.findMany = vi.fn(async () => [
      { code: 'R3', nameEL: 'ΠΕΡΙΦΕΡΕΙΑ ΑΤΤΙΚΗΣ', level: 3, parentCode: null },
      { code: 'R4', nameEL: 'Π.Ε. ΑΘΗΝΩΝ', level: 4, parentCode: 'R3' },
      { code: 'R5', nameEL: 'ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ', level: 5, parentCode: 'R4' },
    ])

    const rows = await findProspects('prog-1', { kad: true, region: true, legalForm: true })

    expect(rows).toHaveLength(2)
    const t1 = rows.find(r => r.trdrId === 't1')!
    expect(t1.eligible).toBe(true)
    expect(t1.matched).toEqual(expect.arrayContaining(['kad', 'region', 'legalForm']))
    expect(t1.failed).toEqual([])

    const t2 = rows.find(r => r.trdrId === 't2')!
    expect(t2.eligible).toBe(false)
    expect(t2.failed).toEqual(expect.arrayContaining(['kad', 'legalForm']))
    expect(t2.matched).toEqual(['region'])
  })

  it('queries active customer Trdrs only (ISACTIVE=1, SODTYPE=13)', async () => {
    await findProspects('prog-1', { kad: false, region: false, legalForm: false })
    expect(h.db.trdr.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ISACTIVE: 1, SODTYPE: 13 } }),
    )
  })
})

describe('recordLeadClick', () => {
  it('unknown token → ok:false, no write', async () => {
    h.db.programLead.findUnique = vi.fn(async () => null)

    const r = await recordLeadClick('does-not-exist')

    expect(r).toEqual({ ok: false })
    expect(h.db.programLead.update).not.toHaveBeenCalled()
  })

  it('first click marks CLICKED + clickedAt', async () => {
    h.db.programLead.findUnique = vi.fn(async () => ({
      id: 'lead-1',
      status: 'SENT',
      program: { title: 'Ψηφιακός Μετασχηματισμός ΜμΕ' },
    }))

    const r = await recordLeadClick('raw-token')

    expect(r).toEqual({ ok: true, programTitle: 'Ψηφιακός Μετασχηματισμός ΜμΕ' })
    expect(h.db.programLead.update).toHaveBeenCalledTimes(1)
    expect(h.db.programLead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({ status: 'CLICKED' }),
      }),
    )
  })

  it('second click (already CLICKED) is idempotent — no update, clickedAt not rewritten', async () => {
    h.db.programLead.findUnique = vi.fn(async () => ({
      id: 'lead-1',
      status: 'CLICKED',
      program: { title: 'Ψηφιακός Μετασχηματισμός ΜμΕ' },
    }))

    const r = await recordLeadClick('raw-token')

    expect(r).toEqual({ ok: true, programTitle: 'Ψηφιακός Μετασχηματισμός ΜμΕ' })
    expect(h.db.programLead.update).not.toHaveBeenCalled()
  })
})
