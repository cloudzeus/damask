import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { OcrDemoClient } from './ocr-demo-client'

export default async function OcrDemoPage() {
  // 'media.manage' είναι ΠΡΟΣΩΡΙΝΟ permission — δεν υπάρχει ακόμα δικό του permission
  // για OCR. TODO: αντικατάσταση (π.χ. 'findocs.ocr') όταν το <OcrUploader> δεθεί
  // στη μόνιμη ροή παραστατικών (findocs) και αυτή η demo σελίδα αποσυρθεί.
  await requirePermission('media.manage')
  await assertObjectEnabled('ocr-demo')

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Καθημερινά <span aria-hidden>›</span> <b className="text-foreground">OCR (δοκιμή)</b>
          </div>
          <h1 className="text-[22px]">OCR (δοκιμή)</h1>
          <p className="page-head-subtitle mt-0.5 text-[12.5px]">
            Δοκιμαστική σελίδα του &lt;OcrUploader&gt; — θα χρησιμοποιηθεί στη ροή παραστατικών (findocs).
          </p>
        </div>
      </div>

      <OcrDemoClient />
    </div>
  )
}
