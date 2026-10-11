'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LoaderCircle, GripVertical, ArrowUpDown, RotateCcw, ExternalLink } from 'lucide-react'
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { listPublicOrder, savePublicOrder, type PublicOrderItem } from '@/lib/programs/actions'

/** «Σειρά στο website»: drag & drop (ποντίκι, αφή ή πληκτρολόγιο) της σειράς των προγραμμάτων στο δημόσιο site. */
export function PublicOrderButton() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<PublicOrderItem[] | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const [pending, start] = React.useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const load = () => {
    setOpen(true); setItems(null); setDirty(false)
    listPublicOrder().then(setItems).catch(() => { toast.error('Δεν φορτώθηκαν τα προγράμματα.'); setOpen(false) })
  }
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!items || !over || active.id === over.id) return
    const from = items.findIndex(i => i.id === active.id), to = items.findIndex(i => i.id === over.id)
    setItems(arrayMove(items, from, to)); setDirty(true)
  }
  const save = (ids: string[] | null) => start(async () => {
    const r = await savePublicOrder(ids).catch(() => ({ ok: false }))
    if (!r.ok) { toast.error('Η αποθήκευση απέτυχε.'); return }
    toast.success(ids ? 'Η σειρά αποθηκεύτηκε — ισχύει στο website.' : 'Επαναφέρθηκε η αυτόματη σειρά.')
    setOpen(false); router.refresh()
  })

  return (
    <>
      <Button type="button" variant="outline" onClick={load}><ArrowUpDown className="size-4" /> Σειρά στο website</Button>
      <Dialog open={open} onOpenChange={o => { if (!pending) setOpen(o) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Σειρά εμφάνισης στο website</DialogTitle>
            <DialogDescription>Σύρετε τα προγράμματα για να ορίσετε τη σειρά στη σελίδα «Προγράμματα» του site. Με το πληκτρολόγιο: Tab στη λαβή, Space για επιλογή, βελάκια για μετακίνηση.</DialogDescription>
          </DialogHeader>
          {!items ? (
            <div className="flex justify-center py-10"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">Δεν υπάρχουν δημοσιευμένα προγράμματα.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <ol className="flex flex-col gap-2">{items.map((it, i) => <Row key={it.id} item={it} index={i} />)}</ol>
                </SortableContext>
              </DndContext>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" disabled={pending || !items?.some(i => i.ordered)} onClick={() => save(null)} title="Χωρίς χειροκίνητη σειρά: νεότερα πρώτα">
              <RotateCcw className="size-4" /> Αυτόματη σειρά
            </Button>
            <div className="flex gap-2">
              <DialogClose render={<Button type="button" variant="outline" disabled={pending}>Άκυρο</Button>} />
              <Button type="button" disabled={pending || !items?.length || (!dirty && !!items?.every(i => i.ordered))} onClick={() => items && save(items.map(i => i.id))}>
                {pending && <LoaderCircle className="size-4 animate-spin" />} Αποθήκευση σειράς
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Row({ item, index }: { item: PublicOrderItem; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-xl border bg-card p-2.5 ${isDragging ? 'z-10 shadow-lg ring-2 ring-primary/40' : ''}`}>
      <button type="button" {...attributes} {...listeners} aria-label={`Μετακίνηση: ${item.title}`}
        className="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-primary">
        <GripVertical className="size-4" aria-hidden />
      </button>
      <span className="w-6 shrink-0 text-center text-[length:var(--fs-12)] font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
      {item.image
        // eslint-disable-next-line @next/next/no-img-element -- μικρογραφία 56px στο admin
        ? <img src={item.image} alt="" className="h-10 w-14 shrink-0 rounded-md object-cover" />
        : <span className="h-10 w-14 shrink-0 rounded-md bg-muted" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium" title={item.title}>{item.title}</div>
        <div className="text-[length:var(--fs-11-5)] text-muted-foreground">{item.deadline ? `Έως ${item.deadline}` : 'Χωρίς προθεσμία'}</div>
      </div>
      <a href={`/programs/${item.id}`} target="_blank" rel="noopener" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Άνοιγμα προγράμματος"><ExternalLink className="size-3.5" /></a>
    </li>
  )
}
