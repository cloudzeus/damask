'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { LuCheck } from 'react-icons/lu'
import { OcrUploader } from '@/components/ocr/ocr-uploader'
import { CompanyInvoicePanel } from '@/components/invoices/company-invoice-panel'
import type { ExtractedDocument } from '@/lib/ocr/schema'

export function OcrDemoClient() {
  const [confirmed, setConfirmed] = useState<ExtractedDocument | null>(null)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-5">
      <OcrUploader
        title="Ανάγνωση παραστατικού"
        onConfirm={data => {
          setConfirmed(data)
          setConfirmedAt(new Date().toLocaleString('el-GR'))
          toast.success('Επιβεβαιώθηκε — δες το JSON παρακάτω (proof).')
        }}
      />

      {confirmed && <CompanyInvoicePanel extracted={confirmed} />}

      {confirmed && (
        <div className="glass p-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
              <LuCheck className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-[length:var(--fs-14)] font-bold">Επιβεβαιωμένο JSON</h2>
              <p className="text-[length:var(--fs-11-5)] text-muted-foreground">
                {confirmedAt} — αυτό είναι ό,τι θα σταλεί στο findocs pipeline αργότερα (proof-of-concept).
              </p>
            </div>
          </div>
          <pre
            className="overflow-auto rounded-2xl border border-border p-4 text-[length:var(--fs-12)] leading-relaxed"
            style={{ background: 'var(--muted)', fontFamily: 'ui-monospace, "SF Mono", monospace', maxHeight: 480 }}
          >
            {JSON.stringify(confirmed, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
