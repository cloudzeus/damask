import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  db: {
    programExpense: {
      findUniqueOrThrow: vi.fn(),
    },
    programApplication: {
      findFirst: vi.fn(),
    },
    programExpenseCertification: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  } as any,
}))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'u1', role: 'ADMIN', permissions: ['pm.manage'], trdrId: null },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))

import { upsertCertification } from '@/lib/pm/actions'

const COMPLETE_EXISTING = {
  expenseId: 'e1',
  serialNumber: 'SN-1',
  location: null,
  assetRegistryRef: 'REG-1',
  assetRegistryDate: null,
  photoKey: 'pm/app-1/cert/e1/photo.jpg',
  bankStatementKey: 'pm/app-1/cert/e1/bankStatement.pdf',
  newUnusedCertKey: 'pm/app-1/cert/e1/newUnusedCert.pdf',
  paid: true,
  verified: false,
  verifiedById: null,
  notes: null,
}

describe('upsertCertification — server-side completeness guard', () => {
  beforeEach(() => {
    h.db.programExpense.findUniqueOrThrow.mockReset()
    h.db.programApplication.findFirst.mockReset()
    h.db.programExpenseCertification.findUnique.mockReset()
    h.db.programExpenseCertification.upsert.mockReset()

    h.db.programExpense.findUniqueOrThrow.mockResolvedValue({ id: 'e1', applicationId: 'app-1' })
    h.db.programApplication.findFirst.mockResolvedValue({ id: 'app-1', programId: 'prog-1' })
    h.db.programExpenseCertification.upsert.mockResolvedValue({})
  })

  it('blocks verified=true when the cert is INCOMPLETE (no existing row)', async () => {
    h.db.programExpenseCertification.findUnique.mockResolvedValue(null)

    await upsertCertification('e1', { verified: true })

    expect(h.db.programExpenseCertification.upsert).toHaveBeenCalledTimes(1)
    const args = h.db.programExpenseCertification.upsert.mock.calls[0][0]
    expect(args.create.verified).toBe(false)
    expect(args.update.verified).toBe(false)
  })

  it('allows verified=true when merged state is COMPLETE', async () => {
    h.db.programExpenseCertification.findUnique.mockResolvedValue(COMPLETE_EXISTING)

    await upsertCertification('e1', { verified: true })

    expect(h.db.programExpenseCertification.upsert).toHaveBeenCalledTimes(1)
    const args = h.db.programExpenseCertification.upsert.mock.calls[0][0]
    expect(args.create.verified).toBe(true)
    expect(args.create.verifiedById).toBe('u1')
    expect(args.update.verified).toBe(true)
    expect(args.update.verifiedById).toBe('u1')
  })

  it('auto-clears verified when a mandatory field is removed from an already-verified complete cert', async () => {
    h.db.programExpenseCertification.findUnique.mockResolvedValue({ ...COMPLETE_EXISTING, verified: true, verifiedById: 'u1' })

    await upsertCertification('e1', { serialNumber: null, location: null })

    expect(h.db.programExpenseCertification.upsert).toHaveBeenCalledTimes(1)
    const args = h.db.programExpenseCertification.upsert.mock.calls[0][0]
    expect(args.create.verified).toBe(false)
    expect(args.update.verified).toBe(false)
  })
})
