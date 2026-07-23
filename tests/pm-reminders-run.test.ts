import { describe, it, expect, vi, beforeEach } from 'vitest'
const h = vi.hoisted(() => ({ db: {} as any, sendMail: vi.fn(), isMailerConfigured: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))
vi.mock('@/lib/mailer', () => ({ sendMail: h.sendMail, isMailerConfigured: h.isMailerConfigured }))
import { runPmReminders } from '@/lib/pm/reminders-run'
const NOW = Date.UTC(2026, 2, 10, 9, 0)
beforeEach(() => {
  h.sendMail.mockReset().mockResolvedValue({ ok: true, id: 'm1' })
  h.isMailerConfigured.mockReset().mockResolvedValue(true)
  h.db.applicationObligation = { findMany: vi.fn().mockResolvedValue([
    { id: 'a', name: 'Έντυπο', status: 'PENDING', dueDate: new Date('2026-03-01'), assigneeId: 'u1', assignee: { id: 'u1', email: 'n@x.gr', name: 'Νίκος' }, application: { trdr: { NAME: 'ΑΦΟΙ' }, program: { title: 'Πρ' } } },
    { id: 'b', name: 'Παραδοτέο', status: 'IN_PROGRESS', dueDate: new Date('2026-03-11'), assigneeId: 'u1', assignee: { id: 'u1', email: 'n@x.gr', name: 'Νίκος' }, application: { trdr: { NAME: 'ΑΦΟΙ' }, program: { title: 'Πρ' } } },
  ]) }
  h.db.reminderLog = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) }
})
describe('runPmReminders', () => {
  it('no-op when mailer not configured', async () => {
    h.isMailerConfigured.mockResolvedValue(false)
    const r = await runPmReminders(NOW)
    expect(h.sendMail).not.toHaveBeenCalled(); expect(r.sent).toBe(0)
  })
  it('sends one digest + logs SENT with counts', async () => {
    const r = await runPmReminders(NOW)
    expect(h.sendMail).toHaveBeenCalledTimes(1)
    expect(r.sent).toBe(1)
    const logArg = h.db.reminderLog.create.mock.calls[0][0].data
    expect(logArg).toMatchObject({ status: 'SENT', overdueCount: 1, dueSoonCount: 1, email: 'n@x.gr' })
  })
  it('skips when a SENT log exists today (idempotent)', async () => {
    h.db.reminderLog.findFirst.mockResolvedValue({ id: 'prev' })
    const r = await runPmReminders(NOW)
    expect(h.sendMail).not.toHaveBeenCalled(); expect(r.skipped).toBeGreaterThanOrEqual(1)
  })
})
