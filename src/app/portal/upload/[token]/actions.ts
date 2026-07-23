'use server'

import { submitDocumentUpload } from '@/lib/pm/portal-public'

/**
 * Λεπτό server action wrapper γύρω από submitDocumentUpload — επιτρέπει στο
 * client form (PortalUploadForm) να το καλέσει απευθείας. Το token περνάει
 * ρητά ως όρισμα (όχι από cookie/session — δημόσια σελίδα, C2d).
 */
export async function uploadPortalDocument(
  token: string,
  file: { filename: string; base64: string; mimeType: string },
) {
  return submitDocumentUpload(token, file)
}
