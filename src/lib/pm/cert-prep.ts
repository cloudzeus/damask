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

/**
 * @deprecated V1 predicate — folded photo/bankStatement/newUnusedCert file-key scalars into the
 * completeness check. C2g migrated those file keys into ExpenseDeliverableTask/DeliverableFile
 * rows, so this no longer reflects live completeness for upsertCertification/listCertifications.
 * Kept only because tests/pm-cert-prep.test.ts still exercises it directly. Use
 * `certificationScalarsComplete` (below) + `verifiedFromTasks` (@/lib/pm/deliverable-phases) instead.
 *
 * Physical-object certification is complete only when: identified (serial OR location),
 * registered in the asset registry, photographed, paid (with bank statement), and the
 * new-and-unused certificate is on file. Mirrors spec §3ζ.
 */
export function certificationComplete(c: CertState): boolean {
  const identified = !!(c.serialNumber || c.location)
  return identified
    && !!c.assetRegistryRef
    && !!c.photoKey
    && c.paid
    && !!c.bankStatementKey
    && !!c.newUnusedCertKey
}

/**
 * V2 scalar predicate (C2g). File-key completeness (photo/bankStatement/newUnusedCert) moved to
 * ExpenseDeliverableTask/DeliverableFile rows and is now covered separately by
 * `verifiedFromTasks` (@/lib/pm/deliverable-phases) over the PHASE_A_CERTIFICATION +
 * FULL_CERTIFICATION mandatory tasks. This predicate covers only what remains scalar on
 * ProgramExpenseCertification: identified (serial OR location), registered in the asset
 * registry, and paid. Overall completeness = certificationScalarsComplete(...) && verifiedFromTasks(...).
 */
export type CertScalarState = { serialNumber: string | null; location: string | null; assetRegistryRef: string | null; paid: boolean }
export function certificationScalarsComplete(s: CertScalarState): boolean {
  return !!(s.serialNumber || s.location) && !!s.assetRegistryRef && s.paid
}

const KEY_FIELD: Record<CertFileKind, string> = { photo: 'photoKey', bankStatement: 'bankStatementKey', newUnusedCert: 'newUnusedCertKey' }
export const certKeyField = (k: CertFileKind) => KEY_FIELD[k]

export function certFileKey(applicationId: string, expenseId: string, kind: CertFileKind, ext: string): string {
  return `pm/${applicationId}/cert/${expenseId}/${kind}.${ext}`
}
