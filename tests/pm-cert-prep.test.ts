import { describe, it, expect } from 'vitest'
import { certificationComplete, certFileKey, CERT_FILE_KINDS, type CertState } from '@/lib/pm/cert-prep'

const full: CertState = {
  serialNumber: 'SN1', location: 'Αθήνα', assetRegistryRef: 'MP-1',
  photoKey: 'k1', bankStatementKey: 'k2', newUnusedCertKey: 'k3', paid: true,
}

describe('certificationComplete', () => {
  it('true when all mandatory pieces present', () => { expect(certificationComplete(full)).toBe(true) })
  it('false when photo missing', () => { expect(certificationComplete({ ...full, photoKey: null })).toBe(false) })
  it('false when not paid', () => { expect(certificationComplete({ ...full, paid: false })).toBe(false) })
  it('false when serial and location both missing', () => { expect(certificationComplete({ ...full, serialNumber: null, location: null })).toBe(false) })
})

describe('certFileKey', () => {
  it('maps kind → deterministic bunny key', () => {
    expect(certFileKey('app1', 'exp1', 'photo', 'jpg')).toBe('pm/app1/cert/exp1/photo.jpg')
  })
  it('CERT_FILE_KINDS lists the three file slots', () => {
    expect(CERT_FILE_KINDS.slice().sort()).toEqual(['bankStatement', 'newUnusedCert', 'photo'])
  })
})
