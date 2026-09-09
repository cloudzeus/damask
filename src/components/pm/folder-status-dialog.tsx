'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuSparkles, LuLoaderCircle, LuListChecks } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { applicationFolderStatus, type FolderStatus } from '@/lib/pm/actions'

/**
 * Β3 — «AI Οδηγός φακέλου»: με ένα κλικ, το DeepSeek σαρώνει την κατάσταση του
 * φακέλου (στάδιο/δικαιολογητικά/σχέδιο/υποβολή/αγορές) και εξηγεί «πού είσαι
 * και τι πρέπει να κάνεις μετά» — για μη-τεχνικό χρήστη.
 */
export function FolderStatusDialog({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<FolderStatus | null>(null)

  async function run() {
    setOpen(true)
    setLoading(true)
    setData(null)
    try {
      const res = await applicationFolderStatus(applicationId)
      if (!res.ok) { toast.error(res.message); setOpen(false); return }
      setData(res.result)
    } catch { toast.error('Η σύνοψη απέτυχε.'); setOpen(false) } finally { setLoading(false) }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={run}>
        <LuSparkles className="size-3.5" aria-hidden /> AI Οδηγός φακέλου
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LuSparkles className="size-4 text-primary" aria-hidden /> Οδηγός φακέλου</DialogTitle>
            <DialogDescription>Σύνοψη κατάστασης & επόμενα βήματα (AI, ενδεικτικά — έλεγξέ τα).</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[0.8125rem] text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Ανάλυση φακέλου…</div>
          ) : data ? (
            <div className="flex flex-col gap-3">
              <p className="text-[0.8125rem]">{data.summary}</p>
              {data.nextSteps.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-extrabold uppercase tracking-wide text-muted-foreground"><LuListChecks className="size-3.5" aria-hidden /> Επόμενα βήματα</div>
                  <ol className="flex flex-col gap-1.5">
                    {data.nextSteps.map((s, i) => (
                      <li key={i} className="flex gap-2 rounded-lg bg-card/60 px-2.5 py-1.5 text-[0.78125rem]">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6875rem] font-bold text-primary">{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
