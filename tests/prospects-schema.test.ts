import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Prisma, ProgramLeadStatus } from '@prisma/client'

// NOTE: Prisma.dmmf.datamodel in this build carries only {name,kind,type,relationName}
// per field — no isUnique/isList/default/uniqueIndexes. Structural facts that need
// those (uniqueness, defaults, composite @@unique) are asserted against the schema
// source text instead.
const schemaSource = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
const programLeadBlock = schemaSource.slice(
  schemaSource.indexOf('model ProgramLead {'),
  schemaSource.indexOf('model ProgramApplication {'),
)

describe('W3 ProgramLead schema', () => {
  it('ProgramLead model + fields', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'ProgramLead')!
    expect(m, 'ProgramLead model should exist').toBeTruthy()
    const f = new Set(m.fields.map(x => x.name))
    for (const k of ['programId', 'trdrId', 'email', 'tokenHash', 'status', 'sentAt', 'clickedAt', 'createdAt', 'updatedAt']) {
      expect(f.has(k), k).toBe(true)
    }
  })

  it('ProgramLead.tokenHash is unique', () => {
    expect(/tokenHash\s+String\s+@unique/.test(programLeadBlock)).toBe(true)
  })

  it('ProgramLead has @@unique([programId, trdrId])', () => {
    expect(/@@unique\(\[programId,\s*trdrId\]\)/.test(programLeadBlock)).toBe(true)
  })

  it('ProgramLead.status defaults to PENDING', () => {
    expect(/status\s+ProgramLeadStatus\s+@default\(PENDING\)/.test(programLeadBlock)).toBe(true)
  })

  it('Program has leads back-relation', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'Program')!
    const f = new Set(m.fields.map(x => x.name))
    expect(f.has('leads')).toBe(true)
  })

  it('Trdr has programLeads back-relation', () => {
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === 'Trdr')!
    const f = new Set(m.fields.map(x => x.name))
    expect(f.has('programLeads')).toBe(true)
  })

  // NOTE: Prisma.dmmf.enums is empty in this client build — assert via runtime enum import.
  it('ProgramLeadStatus enum has PENDING/SENT/FAILED/CLICKED', () => {
    expect(Object.values(ProgramLeadStatus)).toEqual(
      expect.arrayContaining(['PENDING', 'SENT', 'FAILED', 'CLICKED']),
    )
  })
})
