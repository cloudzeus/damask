import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMock = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { aiUsage: { create: (...args: unknown[]) => createMock(...args) } } }))

const computeCostAsyncMock = vi.fn()
vi.mock('@/lib/ai/pricing', () => ({ computeCostAsync: (...args: unknown[]) => computeCostAsyncMock(...args) }))

import { logAiUsage } from '@/lib/ai/usage'

beforeEach(() => {
  createMock.mockReset()
  computeCostAsyncMock.mockReset()
  computeCostAsyncMock.mockResolvedValue({ inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, matched: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('logAiUsage', () => {
  it('writes a row with the computed cost + totals derived from input/output tokens', async () => {
    await logAiUsage({
      scope: 'TRANSLATION', provider: 'deepseek', model: 'deepseek-chat',
      inputTokens: 100, outputTokens: 50, durationMs: 250, userId: 'u1', refType: 'post', refId: 'p1',
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    const { data } = createMock.mock.calls[0][0]
    expect(data).toMatchObject({
      scope: 'TRANSLATION', provider: 'deepseek', model: 'deepseek-chat',
      inputTokens: 100, outputTokens: 50, totalTokens: 150,
      inputCost: 0.001, outputCost: 0.002, totalCost: 0.003,
      durationMs: 250, userId: 'u1', refType: 'post', refId: 'p1',
    })
  })

  it('derives totalTokens from input+output when totalTokens is not given explicitly', async () => {
    await logAiUsage({ scope: 'OTHER', provider: 'gemini', model: 'gemini-2.5-flash', inputTokens: 7, outputTokens: 3 })
    expect(createMock.mock.calls[0][0].data.totalTokens).toBe(10)
  })

  it('stores null costs (not 0) when the model pricing is unmatched', async () => {
    computeCostAsyncMock.mockResolvedValue({ inputCost: 0, outputCost: 0, totalCost: 0, matched: false })
    await logAiUsage({ scope: 'OTHER', provider: 'unknown', model: 'mystery-model', inputTokens: 1, outputTokens: 1 })
    const { data } = createMock.mock.calls[0][0]
    expect(data.inputCost).toBeNull()
    expect(data.outputCost).toBeNull()
    expect(data.totalCost).toBeNull()
  })

  it('defaults optional fields (operation/userId/refType/refId) to null', async () => {
    await logAiUsage({ scope: 'OTHER', provider: 'deepseek', model: 'deepseek-chat', inputTokens: 1, outputTokens: 1 })
    const { data } = createMock.mock.calls[0][0]
    expect(data.operation).toBeNull()
    expect(data.userId).toBeNull()
    expect(data.refType).toBeNull()
    expect(data.refId).toBeNull()
    expect(data.durationMs).toBeNull()
  })

  it('NEVER throws — swallows a prisma failure (e.g. DB unreachable)', async () => {
    createMock.mockRejectedValue(new Error('connection refused'))
    await expect(logAiUsage({ scope: 'OTHER', provider: 'deepseek', model: 'deepseek-chat', inputTokens: 1, outputTokens: 1 }))
      .resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('logAiUsage failed', expect.any(Error))
  })

  it('NEVER throws — swallows a pricing computation failure too', async () => {
    computeCostAsyncMock.mockRejectedValue(new Error('settings lookup failed'))
    await expect(logAiUsage({ scope: 'OTHER', provider: 'deepseek', model: 'deepseek-chat', inputTokens: 1, outputTokens: 1 }))
      .resolves.toBeUndefined()
    expect(createMock).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})
