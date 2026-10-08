'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuFolderArchive, LuFileText, LuChevronDown, LuLoaderCircle } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/**
 * «Φάκελος για Διαχειριστική Αρχή»: ZIP (PDF τεκμηρίωσης + πρωτότυπα ανά δαπάνη) ή μόνο PDF.
 * Το ZIP κατεβαίνει με fetch ώστε να φαίνεται πρόοδος (μπορεί να πάρει λίγο με πολλά αρχεία).
 */
export function ExpenseDossierButton({ applicationId }: { applicationId: string }) {
  const [busy, setBusy] = React.useState(false)
  const url = (f: 'zip' | 'pdf') => `/api/applications/${applicationId}/expense-dossier?format=${f}`

  async function downloadZip() {
    setBusy(true)
    const t = toast.loading('Συγκέντρωση δαπανών, προσφορών και παραστατικών…')
    try {
      const res = await fetch(url('zip'), { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') ?? ''
      const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] ?? 'Φάκελος-δαπανών.zip')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
      toast.success('Ο φάκελος δημιουργήθηκε.', { id: t })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η δημιουργία απέτυχε.', { id: t })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" disabled={busy} />}>
        {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuFolderArchive className="size-3.5" aria-hidden />}
        Φάκελος για Διαχειριστική Αρχή <LuChevronDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max min-w-64">
        <DropdownMenuItem onClick={downloadZip}>
          <LuFolderArchive className="size-3.5" aria-hidden /> ZIP — τεκμηρίωση + προσφορές/παραστατικά
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={url('pdf')} target="_blank" rel="noopener" />}>
          <LuFileText className="size-3.5" aria-hidden /> Μόνο PDF τεκμηρίωσης
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
