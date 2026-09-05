import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { OcrDemoClient } from './ocr-demo-client'
import { PageHeader } from '@/components/ui/page-header'

export default async function OcrDemoPage() {
  // 'media.manage' είναι ΠΡΟΣΩΡΙΝΟ permission — δεν υπάρχει ακόμα δικό του permission
  // για OCR. TODO: αντικατάσταση (π.χ. 'findocs.ocr') όταν το <OcrUploader> δεθεί
  // στη μόνιμη ροή παραστατικών (findocs) και αυτή η demo σελίδα αποσυρθεί.
  await requirePermission('media.manage')
  await assertObjectEnabled('ocr-demo')

  return (
    <div>
      <PageHeader
        breadcrumb={<>Καθημερινά <span aria-hidden>›</span></>}
        title="OCR (δοκιμή)"
        subtitle={<>Δοκιμαστική σελίδα του &lt;OcrUploader&gt; — θα χρησιμοποιηθεί στη ροή παραστατικών (findocs).</>}
      />

      <OcrDemoClient />
    </div>
  )
}
