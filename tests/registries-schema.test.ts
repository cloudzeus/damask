import { describe, it, expect } from 'vitest'
import { Prisma, KadLicenseType } from '@prisma/client'

describe('W1 registries schema', () => {
  it('KadLicenseType enum has OPERATING_LICENSE', () => {
    expect(Object.values(KadLicenseType)).toContain('OPERATING_LICENSE')
  })

  it('Region model + fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'Region')!
    expect(m, 'Region model should exist').toBeTruthy()
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['code', 'nameEL', 'level', 'parentCode', 'path', 'latitude', 'longitude', 'isActive']) {
      expect(f.has(k), k).toBe(true)
    }
  })

  it('KadCode model + fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'KadCode')!
    expect(m, 'KadCode model should exist').toBeTruthy()
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['code', 'codeWithoutDots', 'title', 'level', 'sector', 'sectorLetter', 'parentCode', 'path']) {
      expect(f.has(k), k).toBe(true)
    }
  })

  it('KadLicenseRequirement model + fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'KadLicenseRequirement')!
    expect(m, 'KadLicenseRequirement model should exist').toBeTruthy()
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['code', 'licenseType', 'inherited', 'sourceParentCode']) {
      expect(f.has(k), k).toBe(true)
    }
  })

  it('KadImportLog model + fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'KadImportLog')!
    expect(m, 'KadImportLog model should exist').toBeTruthy()
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['totalCodes', 'sourceVersion']) {
      expect(f.has(k), k).toBe(true)
    }
  })
})
