import { describe, it, expect } from 'vitest'
import { DELIVERABLE_CATALOG, type CatalogEntry } from '@/lib/pm/deliverable-catalog'
import { DELIVERABLE_PHASE_ORDER } from '@/lib/pm/deliverable-phases'

describe('DELIVERABLE_CATALOG', () => {
  it('is non-empty', () => {
    expect(DELIVERABLE_CATALOG.length).toBeGreaterThan(0)
  })

  it('has unique keys', () => {
    const keys = DELIVERABLE_CATALOG.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every entry has at least one task', () => {
    for (const entry of DELIVERABLE_CATALOG) {
      expect(entry.tasks.length).toBeGreaterThan(0)
    }
  })

  it('every task phase is a valid DeliverablePhase', () => {
    for (const entry of DELIVERABLE_CATALOG) {
      for (const task of entry.tasks) {
        expect(DELIVERABLE_PHASE_ORDER).toContain(task.phase)
      }
    }
  })

  it('every task has minFiles >= 1', () => {
    for (const entry of DELIVERABLE_CATALOG) {
      for (const task of entry.tasks) {
        expect(task.minFiles).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('every entry has a non-empty name, description and valid appliesTo', () => {
    for (const entry of DELIVERABLE_CATALOG) {
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
      expect(['EXPENSE', 'APPLICATION']).toContain(entry.appliesTo)
    }
  })

  it('every task has a non-empty name', () => {
    for (const entry of DELIVERABLE_CATALOG) {
      for (const task of entry.tasks) {
        expect(task.name.length).toBeGreaterThan(0)
      }
    }
  })

  it('includes the standard catalog keys from the spec', () => {
    const keys = DELIVERABLE_CATALOG.map((e) => e.key)
    expect(keys).toEqual(expect.arrayContaining(['personnel', 'equipment', 'software', 'licenses', 'building', 'marketing']))
  })

  it('licenses entry is APPLICATION-scoped', () => {
    const licenses = DELIVERABLE_CATALOG.find((e) => e.key === 'licenses') as CatalogEntry
    expect(licenses).toBeDefined()
    expect(licenses.appliesTo).toBe('APPLICATION')
  })

  it('other standard entries are EXPENSE-scoped', () => {
    for (const key of ['personnel', 'equipment', 'software', 'building', 'marketing']) {
      const entry = DELIVERABLE_CATALOG.find((e) => e.key === key) as CatalogEntry
      expect(entry).toBeDefined()
      expect(entry.appliesTo).toBe('EXPENSE')
    }
  })

  it('personnel entry has tasks spanning SUBMISSION, FINAL_PAYMENT and FULL_CERTIFICATION', () => {
    const personnel = DELIVERABLE_CATALOG.find((e) => e.key === 'personnel') as CatalogEntry
    const phases = new Set(personnel.tasks.map((t) => t.phase))
    expect(phases.has('SUBMISSION')).toBe(true)
    expect(phases.has('FINAL_PAYMENT')).toBe(true)
    expect(phases.has('FULL_CERTIFICATION')).toBe(true)
  })

  it('personnel FINAL_PAYMENT payroll statements task requires at least 1 file and is mandatory + on-site', () => {
    const personnel = DELIVERABLE_CATALOG.find((e) => e.key === 'personnel') as CatalogEntry
    const payroll = personnel.tasks.find((t) => t.name.includes('μισθοδοτικές καταστάσεις'))
    expect(payroll).toBeDefined()
    expect(payroll!.mandatory).toBe(true)
    expect(payroll!.onSiteVerification).toBe(true)
    expect(payroll!.minFiles).toBeGreaterThanOrEqual(1)
  })

  it('equipment FULL_CERTIFICATION photos task requires at least 2 files', () => {
    const equipment = DELIVERABLE_CATALOG.find((e) => e.key === 'equipment') as CatalogEntry
    const photos = equipment.tasks.find((t) => t.name.toLowerCase().includes('φωτογραφ'))
    expect(photos).toBeDefined()
    expect(photos!.minFiles).toBeGreaterThanOrEqual(2)
  })

  it('licenses has one mandatory and one non-mandatory task', () => {
    const licenses = DELIVERABLE_CATALOG.find((e) => e.key === 'licenses') as CatalogEntry
    const mandatoryCount = licenses.tasks.filter((t) => t.mandatory).length
    const nonMandatoryCount = licenses.tasks.filter((t) => !t.mandatory).length
    expect(mandatoryCount).toBeGreaterThanOrEqual(1)
    expect(nonMandatoryCount).toBeGreaterThanOrEqual(1)
  })
})
