export const CERT_FILE_KINDS = ['photo', 'bankStatement', 'newUnusedCert'] as const
export type CertFileKind = (typeof CERT_FILE_KINDS)[number]

export type CertState = {
  serialNumber: string | null
  location: string | null
  assetRegistryRef: string | null
  photoKey: string | null
  bankStatementKey: string | null
  newUnusedCertKey: string | null
  paid: boolean
}

// Physical-object certification is complete only when: identified (serial OR location),
// registered in the asset registry, photographed, paid (with bank statement), and the
// new-and-unused certificate is on file. Mirrors spec §3ζ.
export function certificationComplete(c: CertState): boolean {
  const identified = !!(c.serialNumber || c.location)
  return identified
    && !!c.assetRegistryRef
    && !!c.photoKey
    && c.paid
    && !!c.bankStatementKey
    && !!c.newUnusedCertKey
}

const KEY_FIELD: Record<CertFileKind, string> = { photo: 'photoKey', bankStatement: 'bankStatementKey', newUnusedCert: 'newUnusedCertKey' }
export const certKeyField = (k: CertFileKind) => KEY_FIELD[k]

export function certFileKey(applicationId: string, expenseId: string, kind: CertFileKind, ext: string): string {
  return `pm/${applicationId}/cert/${expenseId}/${kind}.${ext}`
}
