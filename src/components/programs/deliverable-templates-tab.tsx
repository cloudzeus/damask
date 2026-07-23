'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuPencil, LuTrash2, LuLoaderCircle, LuLibrary, LuChevronDown, LuChevronUp, LuCopy,
  LuFileStack,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  listDeliverableTemplates, saveDeliverableTemplate, deleteDeliverableTemplate,
  listDeliverableTemplateLibrary, copyDeliverableTemplates, type DeliverableTemplateItem,
} from '@/lib/pm/actions'
import { DELIVERABLE_PHASE_ORDER, deliverablePhaseLabel } from '@/lib/pm/deliverable-phases'
import { DeliverableWizard } from './deliverable-wizard'

/**
 * «Παραδοτέα ανά Φάση» tab (C2g Task 7, amended) — self-fetching, mirror
 * του RequiredFormsTab/TaskTemplatesTab idiom. Ο διαχειριστής δημιουργεί/
 * επεξεργάζεται παραδοτέα με τον DeliverableWizard, ή αντιγράφει έτοιμα
 * σύνολα από άλλα προγράμματα μέσω της Βιβλιοθήκης.
 */

export function DeliverableTemplatesTab({ programId }: { programId: string }) {
  const [items, setItems] = React.useState<DeliverableTemplateItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = React.useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    listDeliverableTemplates(programId)
      .then(setItems)
      .catch(() => setError('Η φόρτωση των παραδοτέων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [programId])

  React.useEffect(() => { load() }, [load])

  async function handleDelete(item: DeliverableTemplateItem) {
    if (!window.confirm(`Διαγραφή του παραδοτέου «${item.name}»;`)) return
    const prev = items
    setItems(prev.filter(i => i.id !== item.id))
    try {
      await deleteDeliverableTemplate(item.id)
      toast.success('Το παραδοτέο διαγράφηκε.')
    } catch {
      toast.error('Η διαγραφή απέτυχε.')
      setItems(prev)
    }
  }

  async function handleToggleActive(item: DeliverableTemplateItem) {
    const prev = items
    setItems(prevItems => prevItems.map(i => (i.id === item.id ? { ...i, active: !i.active } : i)))
    try {
      await saveDeliverableTemplate({
        id: item.id,
        programId,
        name: item.name,
        description: item.description,
        appliesTo: item.appliesTo,
        active: !item.active,
        tasks: item.tasks.map(t => ({
          id: t.id, phase: t.phase, name: t.name, description: t.description,
          mandatory: t.mandatory, onSiteVerification: t.onSiteVerification, minFiles: t.minFiles, order: t.order,
        })),
      })
      toast.success(item.active ? 'Το παραδοτέο απενεργοποιήθηκε.' : 'Το παραδοτέο ενεργοποιήθηκε.')
    } catch {
      toast.error('Η ενημέρωση απέτυχε.')
      setItems(prev)
    }
  }

  return (
    <>
      <section className="glass rounded-[22px] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
            Παραδοτέα ({items.length})
          </div>
          <Button type="button" variant="outline" onClick={() => setLibraryOpen(true)}>
            <LuLibrary className="size-3.5" aria-hidden /> Βιβλιοθήκη
          </Button>
          <DeliverableWizard programId={programId} onSaved={load} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
          </div>
        ) : error ? (
          <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-muted-foreground">
            Δεν έχουν οριστεί παραδοτέα — ξεκίνησε με τον οδηγό ή τη Βιβλιοθήκη.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map(item => (
              <TemplateCard
                key={item.id}
                programId={programId}
                item={item}
                onSaved={load}
                onDelete={() => handleDelete(item)}
                onToggleActive={() => handleToggleActive(item)}
              />
            ))}
          </div>
        )}
      </section>

      {libraryOpen && (
        <LibraryDialog programId={programId} onClose={() => setLibraryOpen(false)} onCopied={load} />
      )}
    </>
  )
}

function TemplateCard({
  programId, item, onSaved, onDelete, onToggleActive,
}: {
  programId: string
  item: DeliverableTemplateItem
  onSaved: () => void
  onDelete: () => void
  onToggleActive: () => void
}) {
  const [expanded, setExpanded] = React.useState(false)

  const phases = React.useMemo(() => {
    const set = new Set(item.tasks.map(t => t.phase))
    return DELIVERABLE_PHASE_ORDER.filter(p => set.has(p))
  }, [item.tasks])

  return (
    <div className={cn('rounded-[18px] border border-border bg-card p-3.5', !item.active && 'opacity-60')}>
      <div className="flex flex-wrap items-start gap-2.5">
        <LuFileStack className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <b className="text-[13.5px]">{item.name}</b>
            <span className="badge-pill info">{item.appliesTo === 'EXPENSE' ? 'Ανά δαπάνη' : 'Ανά έργο'}</span>
            <span className="badge-pill muted">{item.tasks.length} {item.tasks.length === 1 ? 'task' : 'tasks'}</span>
            {!item.active && <span className="badge-pill muted">Ανενεργό</span>}
          </div>
          {item.description && <p className="mt-0.5 text-[12px] text-muted-foreground">{item.description}</p>}
          {phases.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {phases.map(p => (
                <span key={p} className="badge-pill muted">{deliverablePhaseLabel(p)}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-1.5 pr-1">
            <Switch checked={item.active} onCheckedChange={onToggleActive} aria-label={`Ενεργό — ${item.name}`} />
          </div>
          <DeliverableWizard
            programId={programId}
            existing={item}
            onSaved={onSaved}
            trigger={(
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Επεξεργασία — ${item.name}`}
                title="Επεξεργασία"
              >
                <LuPencil className="size-3.5" aria-hidden />
              </button>
            )}
          />
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Διαγραφή — ${item.name}`}
            title="Διαγραφή"
          >
            <LuTrash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {item.tasks.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="mt-2 flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
          >
            {expanded ? <LuChevronUp className="size-3.5" aria-hidden /> : <LuChevronDown className="size-3.5" aria-hidden />}
            {expanded ? 'Απόκρυψη tasks' : 'Προβολή tasks'}
          </button>

          {expanded && (
            <ul className="mt-2 flex flex-col gap-1.5 border-t border-dashed border-border pt-2">
              {item.tasks.map(t => (
                <li key={t.id} className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  <span className="badge-pill muted">{deliverablePhaseLabel(t.phase)}</span>
                  <span className="min-w-0 flex-1 font-semibold">{t.name}</span>
                  {t.mandatory && <span className="badge-pill warn">Υποχρεωτικό</span>}
                  {t.onSiteVerification && <span className="badge-pill info">Επιτόπια</span>}
                  <span className="badge-pill muted">{t.minFiles} {t.minFiles === 1 ? 'αρχείο' : 'αρχεία'}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function LibraryDialog({
  programId, onClose, onCopied,
}: {
  programId: string
  onClose: () => void
  onCopied: () => void
}) {
  const [groups, setGroups] = React.useState<{ programId: string; programTitle: string; templates: DeliverableTemplateItem[] }[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [copying, setCopying] = React.useState(false)

  React.useEffect(() => {
    listDeliverableTemplateLibrary()
      .then(rows => setGroups(rows.filter(g => g.programId !== programId)))
      .catch(() => setError('Η φόρτωση της βιβλιοθήκης απέτυχε.'))
      .finally(() => setLoading(false))
  }, [programId])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleOpenChange(next: boolean) {
    if (copying) return
    if (!next) onClose()
  }

  async function handleCopy() {
    if (selected.size === 0) {
      toast.error('Επίλεξε τουλάχιστον ένα παραδοτέο για αντιγραφή.')
      return
    }
    setCopying(true)
    try {
      const { copied } = await copyDeliverableTemplates(programId, [...selected])
      toast.success(`Αντιγράφηκαν ${copied} παραδοτέα.`)
      onCopied()
      onClose()
    } catch {
      toast.error('Η αντιγραφή απέτυχε.')
    } finally {
      setCopying(false)
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="glass sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Βιβλιοθήκη παραδοτέων</DialogTitle>
          <DialogDescription>Αντίγραψε έτοιμα παραδοτέα (με τα tasks τους) από άλλα προγράμματα σε αυτό.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
          </div>
        ) : error ? (
          <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
        ) : groups.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-muted-foreground">
            Δεν υπάρχουν παραδοτέα σε άλλα προγράμματα ακόμη.
          </p>
        ) : (
          <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto">
            {groups.map(group => (
              <div key={group.programId}>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                  {group.programTitle}
                </div>
                <div className="flex flex-col gap-1.5">
                  {group.templates.map(t => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-start gap-2 rounded-[12px] border border-border bg-card p-2.5 hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggle(t.id)}
                        className="mt-0.5 size-3.5 shrink-0"
                        disabled={copying}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <b className="text-[12.5px]">{t.name}</b>
                          <span className="badge-pill info">{t.appliesTo === 'EXPENSE' ? 'Ανά δαπάνη' : 'Ανά έργο'}</span>
                          <span className="badge-pill muted">{t.tasks.length} {t.tasks.length === 1 ? 'task' : 'tasks'}</span>
                        </div>
                        {t.description && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t.description}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <DialogClose render={<Button type="button" variant="outline" disabled={copying}>Άκυρο</Button>} />
          <Button type="button" onClick={handleCopy} disabled={copying || selected.size === 0}>
            {copying ? 'Αντιγραφή…' : (<><LuCopy className="size-3.5" aria-hidden /> Αντιγραφή ({selected.size})</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
