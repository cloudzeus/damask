import { describe, it, expect } from 'vitest'
import { Prisma, ActivityKind, DocumentSource, TrdrDocumentKind } from '@prisma/client'

describe('W2 Trdr ΓΕΜΗ/ΑΑΔΕ schema', () => {
  it('Trdr has ΓΕΜΗ/ΑΑΔΕ/geo extras', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'Trdr')!
    expect(m, 'Trdr model should exist').toBeTruthy()
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['arGemi', 'gemiSyncedAt', 'foundingDate', 'aadeStatus', 'regionCode', 'geocodedAddress']) {
      expect(f.has(k), k).toBe(true)
    }
  })

  it('TrdrKad model + fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'TrdrKad')!
    expect(m, 'TrdrKad model should exist').toBeTruthy()
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['trdrId', 'code', 'codeWithoutDots', 'codeAade', 'kind', 'order']) {
      expect(f.has(k), k).toBe(true)
    }
  })

  it('TrdrDocument model + fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'TrdrDocument')!
    expect(m, 'TrdrDocument model should exist').toBeTruthy()
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['trdrId', 'source', 'docKind', 'kak', 'storageKey']) {
      expect(f.has(k), k).toBe(true)
    }
  })

  it('MunicipalityRef model + fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'MunicipalityRef')!
    expect(m, 'MunicipalityRef model should exist').toBeTruthy()
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['prefectureId']) {
      expect(f.has(k), k).toBe(true)
    }
  })

  it('LegalType / GemiOfficeRef / CompanyStatusRef / PrefectureRef models exist', () => {
    const names = new Set(Prisma.dmmf.datamodel.models.map(m => m.name))
    for (const k of ['LegalType', 'GemiOfficeRef', 'CompanyStatusRef', 'PrefectureRef']) {
      expect(names.has(k), k).toBe(true)
    }
  })

  it('Region has trdrs back-relation', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'Region')!
    const f = new Set(m.fields.map(x => x.name))
    expect(f.has('trdrs')).toBe(true)
  })

  // NOTE: Prisma.dmmf.enums is empty in this client build — assert via runtime enum imports.
  it('ActivityKind enum has PRIMARY/SECONDARY', () => {
    expect(Object.values(ActivityKind)).toEqual(expect.arrayContaining(['PRIMARY', 'SECONDARY']))
  })

  it('DocumentSource enum has GEMI/MANUAL', () => {
    expect(Object.values(DocumentSource)).toEqual(expect.arrayContaining(['GEMI', 'MANUAL']))
  })

  it('TrdrDocumentKind enum has DECISION/PUBLICATION/OTHER', () => {
    expect(Object.values(TrdrDocumentKind)).toEqual(expect.arrayContaining(['DECISION', 'PUBLICATION', 'OTHER']))
  })
})
