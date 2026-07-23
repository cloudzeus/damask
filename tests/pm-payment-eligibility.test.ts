import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Server-side eligibility gate για addExpenseToRequest (C2f). Ίδιο idiom με
 * tests/pm-cert-verified-guard.test.ts: hoisted prisma mock, requirePermission
 * επιτυχές (δεν ελέγχουμε εδώ το rbac gate — αυτό καλύπτεται από
 * pm-c2f-actions-guard.test.ts), εστιάζουμε στο ΚΡΙΣΙΜΟ business gate:
 * καμία δαπάνη δεν μπαίνει σε δόση χωρίς server-side eligibility check
 * (canTransition/expenseEligibleForPayment) — ποτέ εμπιστοσύνη σε client flag.
 *
 * Query shape mirrors the real requireVisibleRequest/requireVisibleApplication:
 * - requireVisibleRequest(requestId) -> prisma.paymentRequest.findUniqueOrThrow({ id, applicationId, status })
 * - requireVisibleApplication(applicationId) -> prisma.programApplication.findFirst({ id, ...visibleApplicationWhere })
 * - addExpenseToRequest then -> prisma.programExpense.findUniqueOrThrow(expense w/ certification)
 * - on success -> prisma.programExpense.update({ where:{id}, data:{ paymentRequestId } })
 */

const h = vi.hoisted(() => ({
  db: {
    paymentRequest: {
      findUniqueOrThrow: vi.fn(),
    },
    programApplication: {
      findFirst: vi.fn(),
    },
    programExpense: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
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

import { addExpenseToRequest } from '@/lib/pm/actions'

const REQUEST_DRAFT = { id: 'r1', applicationId: 'app-1', status: 'DRAFT' }
const REQUEST_SUBMITTED = { id: 'r1', applicationId: 'app-1', status: 'SUBMITTED' }
const APP = { id: 'app-1', programId: 'prog-1' }

const ELIGIBLE_EXPENSE = {
  id: 'e1',
  applicationId: 'app-1',
  confirmed: true,
  status: 'ACTIVE',
  paymentRequestId: null,
  certification: { verified: true },
}

describe('addExpenseToRequest — server-side payment eligibility gate', () => {
  beforeEach(() => {
    h.db.paymentRequest.findUniqueOrThrow.mockReset()
    h.db.programApplication.findFirst.mockReset()
    h.db.programExpense.findUniqueOrThrow.mockReset()
    h.db.programExpense.update.mockReset()

    h.db.paymentRequest.findUniqueOrThrow.mockResolvedValue(REQUEST_DRAFT)
    h.db.programApplication.findFirst.mockResolvedValue(APP)
    h.db.programExpense.update.mockResolvedValue({})
  })

  it('rejects when the request status !== DRAFT', async () => {
    h.db.paymentRequest.findUniqueOrThrow.mockResolvedValue(REQUEST_SUBMITTED)
    h.db.programExpense.findUniqueOrThrow.mockResolvedValue(ELIGIBLE_EXPENSE)

    await expect(addExpenseToRequest('r1', 'e1')).rejects.toThrow()
    expect(h.db.programExpense.update).not.toHaveBeenCalled()
  })

  it('rejects when certification.verified is false/null ("λείπει πιστοποίηση")', async () => {
    h.db.programExpense.findUniqueOrThrow.mockResolvedValue({ ...ELIGIBLE_EXPENSE, certification: { verified: false } })

    await expect(addExpenseToRequest('r1', 'e1')).rejects.toThrow(/λείπει πιστοποίηση/)
    expect(h.db.programExpense.update).not.toHaveBeenCalled()
  })

  it('rejects when certification is missing entirely (null verified)', async () => {
    h.db.programExpense.findUniqueOrThrow.mockResolvedValue({ ...ELIGIBLE_EXPENSE, certification: null })

    await expect(addExpenseToRequest('r1', 'e1')).rejects.toThrow(/λείπει πιστοποίηση/)
    expect(h.db.programExpense.update).not.toHaveBeenCalled()
  })

  it('rejects when expense.status === REPLACED', async () => {
    h.db.programExpense.findUniqueOrThrow.mockResolvedValue({ ...ELIGIBLE_EXPENSE, status: 'REPLACED' })

    await expect(addExpenseToRequest('r1', 'e1')).rejects.toThrow()
    expect(h.db.programExpense.update).not.toHaveBeenCalled()
  })

  it('rejects when the expense is already assigned to ANOTHER request', async () => {
    h.db.programExpense.findUniqueOrThrow.mockResolvedValue({ ...ELIGIBLE_EXPENSE, paymentRequestId: 'r-other' })

    await expect(addExpenseToRequest('r1', 'e1')).rejects.toThrow()
    expect(h.db.programExpense.update).not.toHaveBeenCalled()
  })

  it('succeeds and assigns the expense when eligible', async () => {
    h.db.programExpense.findUniqueOrThrow.mockResolvedValue(ELIGIBLE_EXPENSE)

    await addExpenseToRequest('r1', 'e1')

    expect(h.db.programExpense.update).toHaveBeenCalledTimes(1)
    expect(h.db.programExpense.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { paymentRequestId: 'r1' } })
  })
})
