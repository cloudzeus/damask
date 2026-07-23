import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExtractedDocument } from '@/lib/ocr/schema'

// ── Hoisted mocks ────────────────────────────────────────────────────────

type FakeTrdr = {
  id: string
  TRDR: number | null
  SODTYPE: number
  NAME: string
  AFM: string | null
  ADDRESS: string | null
  CITY: string | null
  ZIP: string | null
  PHONE01: string | null
  EMAIL: string | null
  WEBPAGE: string | null
  syncedAt?: Date | null
}

type FakeProduct = {
  id: string
  code: string
  mtrl: number | null
  s1UpdatedAt: Date | null
  translations: { locale: string; name: string }[]
}

const store: { trdrs: FakeTrdr[]; products: FakeProduct[] } = { trdrs: [], products: [] }
let nextId = 1

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['media.manage', 'programs.manage'], trdrId: null },
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trdr: {
      findFirst: vi.fn(async ({ where }: { where: { AFM: string; SODTYPE: number } }) =>
        store.trdrs.find(t => t.AFM === where.AFM && t.SODTYPE === where.SODTYPE) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `trdr-${nextId++}`, ...data } as FakeTrdr
        store.trdrs.push(row)
        return row
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.trdrs.find(t => t.id === where.id)
        if (!row) throw new Error('trdr not found')
        Object.assign(row, data)
        return row
      }),
    },
    product: {
      findMany: vi.fn(async () => store.products.map(p => ({ id: p.id, code: p.code, translations: p.translations }))),
      create: vi.fn(async ({ data }: { data: { code: string; translations?: { create?: { locale: string; name: string }[] } } }) => {
        const row: FakeProduct = {
          id: `prod-${nextId++}`,
          code: data.code,
          mtrl: null,
          s1UpdatedAt: null,
          translations: data.translations?.create ?? [],
        }
        store.products.push(row)
        return row
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.products.find(p => p.id === where.id)
        if (!row) throw new Error('product not found')
        Object.assign(row, data)
        return row
      }),
    },
  },
}))

vi.mock('@/lib/softone', () => ({ s1: vi.fn() }))
vi.mock('@/lib/settings', () => ({
  getIntegration: vi.fn(async () => ({})),
  isIntegrationConfigured: vi.fn(() => false),
}))
vi.mock('@/lib/trdr/aade', () => ({ aadeLookup: vi.fn() }))
vi.mock('@/lib/programs/actions', () => ({
  createExpense: vi.fn(async () => ({ id: 'exp-1' })),
  suggestExpenseCategory: vi.fn(async () => ({ categoryId: 'cat-1', reason: 'match', confidence: 0.8 })),
}))

import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { s1 } from '@/lib/softone'
import { getIntegration, isIntegrationConfigured } from '@/lib/settings'
import { aadeLookup } from '@/lib/trdr/aade'
import { createExpense, suggestExpenseCategory } from '@/lib/programs/actions'
import { processCompanyInvoice } from '@/lib/invoice-flows/company'
import { processProgramInvoice } from '@/lib/invoice-flows/program'

function makeExtracted(overrides: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return {
    docType: 'invoice',
    issuer: {
      name: 'Προμηθευτής ΑΕ', afm: '094014201', address: 'Οδός 1',
      phones: ['2101234567'], emails: ['info@vendor.gr'], website: null,
    },
    counterparty: null,
    documentNumber: 'INV-001',
    date: '2026-01-15',
    currency: 'EUR',
    lines: [{ description: 'Καρέκλα Οξιάς', quantity: 2, unitPrice: 50, vatPct: 24, total: 100 }],
    totals: { net: 100, vat: 24, gross: 124 },
    confidence: 0.9,
    notes: null,
    ...overrides,
  }
}

beforeEach(() => {
  store.trdrs = []
  store.products = []
  nextId = 1
  vi.mocked(prisma.trdr.findFirst).mockClear()
  vi.mocked(prisma.trdr.create).mockClear()
  vi.mocked(prisma.trdr.update).mockClear()
  vi.mocked(prisma.product.findMany).mockClear()
  vi.mocked(prisma.product.create).mockClear()
  vi.mocked(prisma.product.update).mockClear()
  vi.mocked(requirePermission).mockReset().mockResolvedValue({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['media.manage', 'programs.manage'], trdrId: null },
  } as never)
  vi.mocked(s1).mockReset()
  vi.mocked(getIntegration).mockReset().mockResolvedValue({})
  vi.mocked(isIntegrationConfigured).mockReset().mockReturnValue(false)
  vi.mocked(aadeLookup).mockReset()
  vi.mocked(createExpense).mockReset().mockResolvedValue({ id: 'exp-1' })
  vi.mocked(suggestExpenseCategory).mockReset().mockResolvedValue({ categoryId: 'cat-1', reason: 'match', confidence: 0.8 } as never)
})

describe('processCompanyInvoice — Workflow Α', () => {
  it('rejects without the OCR permission (media.manage)', async () => {
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error('Forbidden: απαιτείται media.manage'))
    await expect(processCompanyInvoice({ extracted: makeExtracted(), docKind: 'purchase' })).rejects.toThrow(/Forbidden/)
  })

  it('matches an existing Trdr by AFM+SODTYPE instead of creating a new one', async () => {
    store.trdrs.push({
      id: 'trdr-existing', TRDR: 999, SODTYPE: 12, NAME: 'Ήδη Υπάρχων', AFM: '094014201',
      ADDRESS: null, CITY: null, ZIP: null, PHONE01: null, EMAIL: null, WEBPAGE: null,
    })
    const report = await processCompanyInvoice({ extracted: makeExtracted({ lines: [] }), docKind: 'purchase' })
    expect(report.trdr).toEqual({ status: 'matched', id: 'trdr-existing' })
    expect(prisma.trdr.create).not.toHaveBeenCalled()
    expect(s1).not.toHaveBeenCalled()
  })

  it('creates a missing Trdr and leaves TRDR null when SoftOne is not configured (non-fatal, not counted as a failure)', async () => {
    vi.mocked(isIntegrationConfigured).mockReturnValue(false)
    const report = await processCompanyInvoice({ extracted: makeExtracted({ lines: [] }), docKind: 'purchase' })
    expect(report.trdr.status).toBe('created')
    const row = store.trdrs.find(t => t.id === report.trdr.id)
    expect(row?.TRDR).toBeNull()
    expect(s1).not.toHaveBeenCalled()
    expect(report.s1.trdrPushed).toBeUndefined()
    expect(report.s1.failed).toBe(0)
  })

  it('creates a missing Trdr and pushes it to SoftOne (SUPPLIER, SODTYPE 12) when the connection is active', async () => {
    vi.mocked(isIntegrationConfigured).mockReturnValue(true)
    vi.mocked(s1).mockResolvedValueOnce({ success: true, SUPPLIER: { id: 555 } })
    const report = await processCompanyInvoice({ extracted: makeExtracted({ lines: [] }), docKind: 'purchase' })
    expect(report.trdr.status).toBe('created')
    expect(report.s1.trdrPushed).toBe(true)
    const row = store.trdrs.find(t => t.id === report.trdr.id)
    expect(row?.TRDR).toBe(555)
    expect(s1).toHaveBeenCalledWith('setData', expect.objectContaining({ OBJECT: 'SUPPLIER' }))
  })

  it('pushes CUSTOMER (SODTYPE 13) for a sale invoice, using the counterparty as the party', async () => {
    vi.mocked(isIntegrationConfigured).mockReturnValue(true)
    vi.mocked(s1).mockResolvedValueOnce({ success: true, CUSTOMER: { id: 321 } })
    const extracted = makeExtracted({
      lines: [],
      counterparty: { name: 'Πελάτης ΑΕ', afm: '999999999', address: null, phones: [], emails: [], website: null },
    })
    const report = await processCompanyInvoice({ extracted, docKind: 'sale' })
    expect(report.trdr.status).toBe('created')
    const row = store.trdrs.find(t => t.id === report.trdr.id)
    expect(row?.SODTYPE).toBe(13)
    expect(row?.AFM).toBe('999999999')
    expect(s1).toHaveBeenCalledWith('setData', expect.objectContaining({ OBJECT: 'CUSTOMER' }))
  })

  it('is non-fatal when the S1 push throws (SoftOne down) — Trdr still created, TRDR stays null, counted as failed', async () => {
    vi.mocked(isIntegrationConfigured).mockReturnValue(true)
    vi.mocked(s1).mockRejectedValueOnce(new Error('S1 timeout'))
    const report = await processCompanyInvoice({ extracted: makeExtracted({ lines: [] }), docKind: 'purchase' })
    expect(report.trdr.status).toBe('created')
    const row = store.trdrs.find(t => t.id === report.trdr.id)
    expect(row?.TRDR).toBeNull()
    expect(report.s1.trdrPushed).toBe(false)
    expect(report.s1.failed).toBe(1)
  })

  it('optionally enriches with ΑΑΔΕ before creating the Trdr, non-fatal on lookup failure', async () => {
    vi.mocked(aadeLookup).mockRejectedValueOnce(new Error('ΑΑΔΕ down'))
    const report = await processCompanyInvoice({
      extracted: makeExtracted({ lines: [] }), docKind: 'purchase', enrichAade: true,
    })
    expect(report.trdr.status).toBe('created')
    expect(aadeLookup).toHaveBeenCalledWith('094014201')
  })

  it('matches an existing Product by name similarity — no new product created', async () => {
    store.products.push({ id: 'prod-1', code: 'ABC-1', mtrl: null, s1UpdatedAt: null, translations: [{ locale: 'el', name: 'Καρέκλα Οξιάς' }] })
    const report = await processCompanyInvoice({ extracted: makeExtracted(), docKind: 'purchase' })
    expect(report.lines).toEqual({ matched: 1, created: 0 })
    expect(prisma.product.create).not.toHaveBeenCalled()
  })

  it('creates a missing line as a new Product and pushes ITEM to S1 when active', async () => {
    vi.mocked(isIntegrationConfigured).mockReturnValue(true)
    vi.mocked(s1)
      .mockResolvedValueOnce({ success: true, SUPPLIER: { id: 555 } }) // trdr push
      .mockResolvedValueOnce({ success: true, ITEM: { id: 777 } }) // item push
    const report = await processCompanyInvoice({ extracted: makeExtracted(), docKind: 'purchase' })
    expect(report.lines).toEqual({ matched: 0, created: 1 })
    expect(report.s1.itemsPushed).toBe(1)
    expect(store.products).toHaveLength(1)
    expect(store.products[0].mtrl).toBe(777)
    expect(s1).toHaveBeenCalledWith('setData', expect.objectContaining({ OBJECT: 'ITEM' }))
  })

  it('is non-fatal when the ITEM S1 push fails — product still created locally, counted as failed', async () => {
    vi.mocked(isIntegrationConfigured).mockReturnValue(true)
    vi.mocked(s1)
      .mockResolvedValueOnce({ success: true, SUPPLIER: { id: 555 } }) // trdr push
      .mockResolvedValueOnce({ success: false, error: 'boom' }) // item push
    const report = await processCompanyInvoice({ extracted: makeExtracted(), docKind: 'purchase' })
    expect(report.lines).toEqual({ matched: 0, created: 1 })
    expect(report.s1.itemsPushed).toBe(0)
    expect(report.s1.failed).toBe(1)
    expect(store.products).toHaveLength(1)
  })
})

describe('processProgramInvoice — Workflow Β', () => {
  it('rejects without programs.manage', async () => {
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error('Forbidden: απαιτείται programs.manage'))
    await expect(
      processProgramInvoice({ applicationId: 'app-1', extracted: makeExtracted() }),
    ).rejects.toThrow(/Forbidden/)
  })

  it('creates the supplier Trdr (SODTYPE 12) and the expense with vendorAfm from OCR — never touches S1', async () => {
    const report = await processProgramInvoice({ applicationId: 'app-1', extracted: makeExtracted() })
    expect(report.trdr.status).toBe('created')
    const row = store.trdrs.find(t => t.id === report.trdr.id)
    expect(row?.SODTYPE).toBe(12)
    expect(row?.AFM).toBe('094014201')
    expect(s1).not.toHaveBeenCalled()

    expect(createExpense).toHaveBeenCalledWith('app-1', expect.objectContaining({
      vendorAfm: '094014201',
      vendor: 'Προμηθευτής ΑΕ',
      docNumber: 'INV-001',
      amount: 124,
      vatAmount: 24,
    }))
    expect(report.expenseId).toBe('exp-1')
  })

  it('matches an existing supplier Trdr instead of creating a duplicate', async () => {
    store.trdrs.push({
      id: 'trdr-existing', TRDR: 42, SODTYPE: 12, NAME: 'Ήδη Υπάρχων', AFM: '094014201',
      ADDRESS: null, CITY: null, ZIP: null, PHONE01: null, EMAIL: null, WEBPAGE: null,
    })
    const report = await processProgramInvoice({ applicationId: 'app-1', extracted: makeExtracted() })
    expect(report.trdr).toEqual({ status: 'matched', id: 'trdr-existing' })
  })

  it('never creates a Product, regardless of how many invoice lines are present', async () => {
    await processProgramInvoice({
      applicationId: 'app-1',
      extracted: makeExtracted({
        lines: [
          { description: 'Καρέκλα Οξιάς', quantity: 1, unitPrice: 50, vatPct: 24, total: 50 },
          { description: 'Τραπέζι', quantity: 1, unitPrice: 74, vatPct: 24, total: 74 },
        ],
      }),
    })
    expect(prisma.product.create).not.toHaveBeenCalled()
  })

  it('is non-fatal when suggestExpenseCategory fails — expense still returned, suggested=null', async () => {
    vi.mocked(suggestExpenseCategory).mockRejectedValueOnce(new Error('DeepSeek down'))
    const report = await processProgramInvoice({ applicationId: 'app-1', extracted: makeExtracted() })
    expect(report.expenseId).toBe('exp-1')
    expect(report.suggested).toBeNull()
  })

  it('returns the AI suggestion when suggestExpenseCategory succeeds', async () => {
    const report = await processProgramInvoice({ applicationId: 'app-1', extracted: makeExtracted() })
    expect(report.suggested).toEqual({ categoryId: 'cat-1', reason: 'match', confidence: 0.8 })
  })
})
