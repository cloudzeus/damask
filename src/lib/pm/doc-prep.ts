/** Private BunnyCDN storage key για ένα ApplicationDocument — καθαρή
 * συνάρτηση (καμία IO), χρησιμοποιείται από uploadApplicationDocument. */
export function applicationDocKey(applicationId: string, id: string, ext: string): string {
  return `pm/${applicationId}/${id}.${ext.replace(/^\./, '')}`
}
