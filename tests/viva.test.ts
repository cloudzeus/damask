import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type SettingRow = { key: string; value: unknown; updatedAt: Date }
const settingStore = new Map<string, SettingRow>()

type PaymentRow = {
  id: string
  orderCode: string
  amountCents: number
  description: string
  customerName: string | null
  customerEmail: string | null
  customerId: string | null
  environment: string
  status: string
  transactionId: string | null
  paidAt: Date | null
  raw: unknown
  createdById: string | null
  createdAt: Date
  updatedAt: Date
}
const paymentStore = new Map<string, PaymentRow>()
let idCounter = 0

function findPayment(where: { id?: string; orderCode?: string }): PaymentRow | null {
  if (where.id) return paymentStore.get(where.id) ?? null
  if (where.orderCode) return [...paymentStore.values()].find(p => p.orderCode === where.orderCode) ?? null
  return null
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => settingStore.get(where.key) ?? null),
      upsert: vi.fn(async ({ where, update, create }: { where: { key: string }; update: { value: unknown }; create: SettingRow }) => {
        const existing = settingStore.get(where.key)
        const row: SettingRow = existing
          ? { ...existing, value: update.value, updatedAt: new Date() }
          : { key: create.key, value: create.value, updatedAt: new Date() }
        settingStore.set(where.key, row)
        return row
      }),
    },
    paymentOrder: {
      create: vi.fn(async ({ data }: { data: Omit<PaymentRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        // Το `data` (όπως το στέλνει το lib/viva.ts createPaymentOrder) δίνει ΠΑΝΤΑ όλα τα πεδία ρητά —
        // δεν χρειάζονται προεπιλογές εδώ (θα ήταν πάντως dead code, TS2783).
        const row: PaymentRow = { id: `pay_${++idCounter}`, createdAt: new Date(), updatedAt: new Date(), ...data }
        paymentStore.set(row.id, row)
        return row
      }),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; orderCode?: string } }) => findPayment(where)),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id?: string; orderCode?: string } }) => {
        const row = findPayment(where)
        if (!row) throw new Error('PaymentOrder not found')
        return row
      }),
      update: vi.fn(async ({ where, data }: { where: { id?: string; orderCode?: string }; data: Partial<PaymentRow> }) => {
        const row = findPayment(where)
        if (!row) throw new Error('PaymentOrder not found')
        Object.assign(row, data, { updatedAt: new Date() })
        return row
      }),
    },
  },
}))

import {
  getVivaSettings, saveVivaSettings, saveVivaLastCheck, isVivaEnvConfigured,
  getAccessToken, createPaymentOrder, getTransaction, verifyWebhookGet,
  processVivaWebhookEvent, refreshPaymentOrderStatus, interpretVivaStatusId,
  resetVivaTokenCache, VivaConfigError,
  VIVA_EVENT_PAYMENT_CREATED, VIVA_EVENT_PAYMENT_FAILED,
} from '@/lib/viva'

const fetchMock = vi.fn()
beforeEach(() => {
  settingStore.clear()
  paymentStore.clear()
  idCounter = 0
  resetVivaTokenCache()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const FULL_ENV_INPUT = { clientId: '', clientSecret: '', sourceCode: '', webhookVerificationKey: '', merchantId: '', apiKey: '' }

async function seedDemoCreds() {
  await saveVivaSettings({
    environment: 'demo',
    bankInstructions: 'IBAN GR1234 — αναφορά ο κωδικός πληρωμής',
    demo: { clientId: 'cid', clientSecret: 'csecret', sourceCode: '1234', webhookVerificationKey: 'wkey', merchantId: '', apiKey: '' },
    production: { ...FULL_ENV_INPUT },
  })
}

function seedPayment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  const row: PaymentRow = {
    id: `pay_${++idCounter}`,
    orderCode: overrides.orderCode ?? `code_${idCounter}`,
    amountCents: 1000,
    description: 'Τιμολόγιο',
    customerName: null,
    customerEmail: null,
    customerId: null,
    environment: 'demo',
    status: 'PENDING',
    transactionId: null,
    paidAt: null,
    raw: null,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  paymentStore.set(row.id, row)
  return row
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('getVivaSettings / saveVivaSettings', () => {
  it('defaults to demo with empty configs when never saved', async () => {
    const s = await getVivaSettings()
    expect(s.environment).toBe('demo')
    expect(s.demo).toEqual({})
    expect(s.production).toEqual({})
    expect(s.bankInstructions).toBe('')
  })

  it('roundtrips environment + nested demo/production credentials', async () => {
    await seedDemoCreds()
    const s = await getVivaSettings()
    expect(s.environment).toBe('demo')
    expect(s.demo.clientId).toBe('cid')
    expect(s.demo.sourceCode).toBe('1234')
    expect(s.production.clientId).toBe('') // μη-secret πεδίο, στάλθηκε ρητά κενό — no special-casing (ίδια σύμβαση με saveIntegration)
  })

  it('an empty clientSecret on save keeps the previously saved secret (per-env, same convention as saveIntegration)', async () => {
    await seedDemoCreds()
    await saveVivaSettings({
      environment: 'demo',
      bankInstructions: 'IBAN GR1234',
      demo: { clientId: 'cid2', clientSecret: '', sourceCode: '1234', webhookVerificationKey: 'wkey', merchantId: '', apiKey: '' },
      production: { ...FULL_ENV_INPUT },
    })
    const s = await getVivaSettings()
    expect(s.demo.clientId).toBe('cid2') // μη-secret πεδίο ενημερώθηκε
    expect(s.demo.clientSecret).toBe('csecret') // secret πεδίο κράτησε την παλιά τιμή
  })

  it('switching the active environment does not touch either credential set', async () => {
    await seedDemoCreds()
    await saveVivaSettings({
      environment: 'production',
      bankInstructions: 'IBAN GR1234',
      demo: { clientId: 'cid', clientSecret: '', sourceCode: '1234', webhookVerificationKey: 'wkey', merchantId: '', apiKey: '' },
      production: { clientId: 'pcid', clientSecret: 'psecret', sourceCode: '5678', webhookVerificationKey: 'pkey', merchantId: '', apiKey: '' },
    })
    const s = await getVivaSettings()
    expect(s.environment).toBe('production')
    expect(s.demo.clientId).toBe('cid')
    expect(s.production.clientId).toBe('pcid')
  })
})

describe('saveVivaLastCheck', () => {
  it('stores the check under the given environment without touching the other env or its own credentials', async () => {
    await seedDemoCreds()
    const check = await saveVivaLastCheck('demo', { ok: true, message: 'Επιτυχής σύνδεση.' })
    expect(check.ok).toBe(true)
    expect(typeof check.at).toBe('string')

    const s = await getVivaSettings()
    expect(s.demo._lastCheck).toEqual(check)
    expect(s.demo.clientId).toBe('cid') // ανέγγιχτο
    expect(s.production._lastCheck).toBeUndefined()
  })
})

describe('isVivaEnvConfigured', () => {
  it('requires clientId + clientSecret + sourceCode', () => {
    expect(isVivaEnvConfigured({})).toBe(false)
    expect(isVivaEnvConfigured({ clientId: 'a', clientSecret: 'b' })).toBe(false)
    expect(isVivaEnvConfigured({ clientId: 'a', clientSecret: 'b', sourceCode: 'c' })).toBe(true)
  })
})

describe('getAccessToken', () => {
  it('throws VivaConfigError (no fetch call) when clientId/clientSecret are missing', async () => {
    await expect(getAccessToken()).rejects.toBeInstanceOf(VivaConfigError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('VivaConfigError message tells the user to configure Viva in Settings', async () => {
    await expect(getAccessToken()).rejects.toThrow('Ρύθμισε το Viva στις Ρυθμίσεις.')
  })

  it('fetches a token from the demo accounts endpoint using Basic auth + client_credentials', async () => {
    await seedDemoCreds()
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok1', expires_in: 3600 }))
    const token = await getAccessToken()
    expect(token).toBe('tok1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://demo-accounts.vivapayments.com/connect/token')
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('cid:csecret').toString('base64')}`)
    expect(init.body).toBe('grant_type=client_credentials')
  })

  it('caches the token in memory — a second call does not re-fetch', async () => {
    await seedDemoCreds()
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok1', expires_in: 3600 }))
    await getAccessToken()
    await getAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('{force:true} bypasses the cache and re-fetches', async () => {
    await seedDemoCreds()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok2', expires_in: 3600 }))
    const t1 = await getAccessToken()
    const t2 = await getAccessToken({ force: true })
    expect([t1, t2]).toEqual(['tok1', 'tok2'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws a plain Error on a non-2xx OAuth response', async () => {
    await seedDemoCreds()
    fetchMock.mockResolvedValueOnce(new Response('bad creds', { status: 401 }))
    await expect(getAccessToken()).rejects.toThrow(/HTTP 401/)
  })

  it('production uses the production accounts endpoint', async () => {
    await saveVivaSettings({
      environment: 'production',
      bankInstructions: '',
      demo: { ...FULL_ENV_INPUT },
      production: { clientId: 'pcid', clientSecret: 'psecret', sourceCode: '999', webhookVerificationKey: '', merchantId: '', apiKey: '' },
    })
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'prod-tok', expires_in: 3600 }))
    await getAccessToken()
    expect(fetchMock.mock.calls[0][0]).toBe('https://accounts.vivapayments.com/connect/token')
  })
})

describe('createPaymentOrder', () => {
  it('rejects a non-positive amount before touching config/fetch', async () => {
    await expect(createPaymentOrder({ amountCents: 0, description: 'x' })).rejects.toThrow(/θετικός/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an empty description before touching config/fetch', async () => {
    await expect(createPaymentOrder({ amountCents: 1000, description: '  ' })).rejects.toThrow(/περιγραφή/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws VivaConfigError when sourceCode is missing even though clientId/clientSecret are set', async () => {
    await saveVivaSettings({
      environment: 'demo',
      bankInstructions: '',
      demo: { clientId: 'cid', clientSecret: 'csecret', sourceCode: '', webhookVerificationKey: '', merchantId: '', apiKey: '' },
      production: { ...FULL_ENV_INPUT },
    })
    await expect(createPaymentOrder({ amountCents: 1000, description: 'Παραγγελία' })).rejects.toBeInstanceOf(VivaConfigError)
  })

  it('creates a Viva order, persists a PENDING PaymentOrder, and returns the checkout URL', async () => {
    await seedDemoCreds()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ orderCode: 1234567890123456 }))

    const { payment, checkoutUrl } = await createPaymentOrder({
      amountCents: 4990, description: 'Τιμολόγιο #42', customerEmail: 'a@b.gr', customerName: 'Ανδρέας',
    })

    expect(payment.orderCode).toBe('1234567890123456') // number → string, ίδιο με το DB unique field
    expect(payment.status).toBe('PENDING')
    expect(payment.amountCents).toBe(4990)
    expect(payment.environment).toBe('demo')
    expect(checkoutUrl).toBe('https://demo.vivapayments.com/web/checkout?ref=1234567890123456')

    const orderCall = fetchMock.mock.calls[1]
    expect(orderCall[0]).toBe('https://demo-api.vivapayments.com/checkout/v2/orders')
    expect(orderCall[1].headers.Authorization).toBe('Bearer tok1')
    const body = JSON.parse(orderCall[1].body)
    expect(body.amount).toBe(4990)
    expect(body.sourceCode).toBe('1234')
    expect(body.customer.email).toBe('a@b.gr')
    expect(body.customer.countryCode).toBe('GR')
  })

  it('throws a descriptive Error when Viva does not return an orderCode', async () => {
    await seedDemoCreds()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid sourceCode' }, 400))
    await expect(createPaymentOrder({ amountCents: 1000, description: 'x' })).rejects.toThrow(/invalid sourceCode/)
  })
})

describe('getTransaction', () => {
  it('calls the transactions endpoint with a Bearer token for the active environment', async () => {
    await seedDemoCreds()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ statusId: 'F' }))
    const tx = await getTransaction('tx-1')
    expect(tx).toEqual({ statusId: 'F' })
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('https://demo-api.vivapayments.com/checkout/v2/transactions/tx-1')
    expect(init.headers.Authorization).toBe('Bearer tok1')
  })
})

describe('interpretVivaStatusId', () => {
  it('maps known Viva statusId codes, leaves pending/unknown as null (no change)', () => {
    expect(interpretVivaStatusId('F')).toBe('PAID')
    expect(interpretVivaStatusId('E')).toBe('FAILED')
    expect(interpretVivaStatusId('R')).toBe('FAILED')
    expect(interpretVivaStatusId('C')).toBe('CANCELED')
    expect(interpretVivaStatusId('A')).toBeNull()
    expect(interpretVivaStatusId(undefined)).toBeNull()
    expect(interpretVivaStatusId(null)).toBeNull()
  })
})

describe('verifyWebhookGet', () => {
  it('returns null when the active environment has no verification key configured', async () => {
    expect(await verifyWebhookGet()).toBeNull()
  })

  it('returns {Key} for the active environment', async () => {
    await seedDemoCreds()
    expect(await verifyWebhookGet()).toEqual({ Key: 'wkey' })
  })
})

describe('processVivaWebhookEvent — webhook handler logic (mocked prisma)', () => {
  it('tolerates an unknown orderCode — handled:false, never throws', async () => {
    const result = await processVivaWebhookEvent({ EventTypeId: VIVA_EVENT_PAYMENT_CREATED, EventData: { OrderCode: 'nope' } })
    expect(result).toEqual({ handled: false, reason: 'unknown-order-code', orderCode: 'nope' })
  })

  it('tolerates a missing OrderCode', async () => {
    const result = await processVivaWebhookEvent({ EventTypeId: VIVA_EVENT_PAYMENT_CREATED })
    expect(result.handled).toBe(false)
    expect(result.reason).toBe('missing-order-code')
  })

  it('1796 (Transaction Payment Created) sets PAID + transactionId + paidAt', async () => {
    seedPayment({ orderCode: '1111' })
    const result = await processVivaWebhookEvent({
      EventTypeId: VIVA_EVENT_PAYMENT_CREATED,
      EventData: { OrderCode: '1111', TransactionId: 'tx-99', StatusId: 'F', Amount: 1000 },
    })
    expect(result.handled).toBe(true)
    const row = findPayment({ orderCode: '1111' })!
    expect(row.status).toBe('PAID')
    expect(row.transactionId).toBe('tx-99')
    expect(row.paidAt).toBeInstanceOf(Date)
    expect(row.raw).toBeTruthy()
  })

  it('1797 (Transaction Failed) sets FAILED and does not set paidAt', async () => {
    seedPayment({ orderCode: '2222' })
    const result = await processVivaWebhookEvent({
      EventTypeId: VIVA_EVENT_PAYMENT_FAILED,
      EventData: { OrderCode: '2222', TransactionId: 'tx-88' },
    })
    expect(result.handled).toBe(true)
    const row = findPayment({ orderCode: '2222' })!
    expect(row.status).toBe('FAILED')
    expect(row.paidAt).toBeNull()
  })

  it('an unrecognised EventTypeId is ignored (handled:false) and leaves status untouched', async () => {
    seedPayment({ orderCode: '3333' })
    const result = await processVivaWebhookEvent({ EventTypeId: 9999, EventData: { OrderCode: '3333' } })
    expect(result.handled).toBe(false)
    expect(result.reason).toBe('ignored-event-type')
    expect(findPayment({ orderCode: '3333' })!.status).toBe('PENDING')
  })

  it('a 1796 PAID event overrides even a locally CANCELED order — Viva is the source of truth', async () => {
    seedPayment({ orderCode: '4444', status: 'CANCELED' })
    await processVivaWebhookEvent({ EventTypeId: VIVA_EVENT_PAYMENT_CREATED, EventData: { OrderCode: '4444', TransactionId: 'tx-1' } })
    expect(findPayment({ orderCode: '4444' })!.status).toBe('PAID')
  })
})

describe('refreshPaymentOrderStatus', () => {
  it('does not call Viva when the order has no transactionId yet (still PENDING, no webhook received)', async () => {
    const row = seedPayment({ orderCode: '5555' })
    const result = await refreshPaymentOrderStatus(row.id)
    expect(result.changed).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the transaction and flips PENDING → PAID on statusId "F"', async () => {
    await seedDemoCreds()
    const row = seedPayment({ orderCode: '6666', transactionId: 'tx-1' })
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ statusId: 'F' }))
    const result = await refreshPaymentOrderStatus(row.id)
    expect(result.changed).toBe(true)
    expect(result.payment.status).toBe('PAID')
    expect(result.payment.paidAt).toBeInstanceOf(Date)
  })

  it('leaves status unchanged on a pending/unrecognised statusId (still persists raw for visibility)', async () => {
    await seedDemoCreds()
    const row = seedPayment({ orderCode: '7777', transactionId: 'tx-2' })
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ statusId: 'A' }))
    const result = await refreshPaymentOrderStatus(row.id)
    expect(result.changed).toBe(false)
    expect(result.payment.status).toBe('PENDING')
    expect(result.payment.raw).toEqual({ statusId: 'A' })
  })
})
