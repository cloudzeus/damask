'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LuLink, LuSearch, LuBuilding2, LuLoaderCircle, LuCheck } from 'react-icons/lu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { createApplication, listTrdrOptions, type TrdrOption } from '@/lib/programs/actions'

const SEARCH_DEBOUNCE_MS = 300

/**
 * «Σύνδεση εταιρείας» (Task 15) — δημιουργεί ProgramApplication για ένα
 * πρόγραμμα + έναν συναλλασσόμενο. Ο picker χρησιμοποιεί listTrdrOptions
 * (νέο, ελαφρύ read action — δεν υπάρχει ήδη γενικό Trdr search στο
 * /partners, μόνο πλήρης λίστα σε server component) με debounce αναζήτησης,
 * mirror του S1SearchableSelect idiom (χωρίς εξωτερικό combobox dependency).
 * createApplication κάνει ήδη upsert στο trdrId+programId unique — ξανα-
 * σύνδεση υπάρχουσας εταιρείας απλά επιστρέφει το ίδιο id, ασφαλές.
 */
export function LinkApplicationDialog({
  programId, onCreated,
}: {
  programId: string
  onCreated: (applicationId: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <LuLink className="size-3.5" aria-hidden /> Σύνδεση εταιρείας
      </Button>
      <LinkApplicationDialogContent programId={programId} open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  )
}

function LinkApplicationDialogContent({
  programId, open, onOpenChange, onCreated,
}: {
  programId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (applicationId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<TrdrOption[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<TrdrOption | null>(null)
  const [linking, setLinking] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setSearching(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      listTrdrOptions(query)
        .then(setOptions)
        .catch(() => toast.error('Η αναζήτηση συναλλασσόμενων απέτυχε.'))
        .finally(() => setSearching(false))
    }, SEARCH_DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, open])

  function reset() {
    setQuery('')
    setOptions([])
    setSelected(null)
    setLinking(false)
  }

  function handleOpenChange(next: boolean) {
    if (linking) return
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleLink() {
    if (!selected) return
    setLinking(true)
    try {
      const { id } = await createApplication({ trdrId: selected.id, programId })
      toast.success(`Η «${selected.name}» συνδέθηκε με το πρόγραμμα.`)
      onCreated(id)
      handleOpenChange(false)
    } catch {
      toast.error('Η σύνδεση απέτυχε.')
      setLinking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Σύνδεση εταιρείας</DialogTitle>
          <DialogDescription>Αναζήτησε συναλλασσόμενο για να δημιουργήσεις αίτηση συμμετοχής στο πρόγραμμα.</DialogDescription>
        </DialogHeader>

        <div className="field !mb-0">
          <label htmlFor="link-app-search">Επωνυμία ή ΑΦΜ</label>
          <div className="inwrap">
            <LuSearch aria-hidden />
            <Input
              id="link-app-search"
              className="!h-auto border-0 bg-transparent p-0 focus-visible:ring-0"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null) }}
              placeholder="π.χ. ΔΑΜΑΣΚ Α.Ε. ή 094123456"
              autoFocus
              autoComplete="off"
              disabled={linking}
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-lg ring-1 ring-foreground/10">
          {searching ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[12.5px] text-muted-foreground">
              <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Αναζήτηση…
            </div>
          ) : options.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-muted-foreground">
              {query.trim() ? 'Δεν βρέθηκαν συναλλασσόμενοι.' : 'Πληκτρολόγησε για αναζήτηση.'}
            </p>
          ) : (
            <ul>
              {options.map(o => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(o)}
                    disabled={linking}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-muted',
                      selected?.id === o.id && 'bg-muted',
                    )}
                  >
                    <LuBuilding2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      <b>{o.name}</b>
                      {o.afm && <span className="ml-1.5 text-muted-foreground">ΑΦΜ {o.afm}</span>}
                    </span>
                    {selected?.id === o.id && <LuCheck className="size-3.5 shrink-0 text-success" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <DialogClose render={<Button type="button" variant="outline" disabled={linking}>Άκυρο</Button>} />
          <Button type="button" onClick={handleLink} disabled={!selected || linking}>
            {linking ? 'Σύνδεση…' : (<><LuLink className="size-3.5" aria-hidden /> Σύνδεση</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
