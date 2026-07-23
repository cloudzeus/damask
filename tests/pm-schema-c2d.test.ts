import { describe, it, expect } from 'vitest'
import { Prisma, DocumentRequestStatus } from '@prisma/client'
describe('C2d schema', () => {
  it('DocumentRequestStatus enum', () => { expect(Object.values(DocumentRequestStatus).sort()).toEqual(['CANCELLED', 'EXPIRED', 'FULFILLED', 'PENDING', 'UPLOADED']) })
  it('DocumentRequest fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'DocumentRequest')!
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['applicationId', 'obligationId', 'trdrId', 'title', 'email', 'tokenHash', 'status', 'expiresAt', 'uploadedDocumentId']) expect(f.has(k), k).toBe(true)
  })
  it('PortalToken fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'PortalToken')!
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['tokenHash', 'trdrId', 'email', 'expiresAt']) expect(f.has(k), k).toBe(true)
  })
})
