'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuPlus, LuPencil, LuTrash2, LuLoaderCircle, LuListChecks, LuGripVertical, LuClock3,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  listProgramTaskTemplates, createProgramTaskTemplate, updateProgramTaskTemplate,
  deleteProgramTaskTemplate, reorderProgramTaskTemplates, type TaskTemplateItem,
} from '@/lib/pm/actions'
import { STAGE_ORDER, stageLabel, taskAssignToLabel, type StageStr, type TaskAssignToStr } from '@/lib/pm/types'

/**
 * «Βήματα Διαχείρισης» tab (C2e) — admin-authored ανά-στάδιο πρότυπα
 * εργασιών ενός Προγράμματος (ProgramTaskTemplate). Mirror δομής του
 * RequiredFormsTab (self-fetching, loading/error/empty, dialog CRUD,
 * sonner toast) + dnd-kit reorder mirror από το ProductImageCollection
 * (sensors/DndContext/SortableContext boilerplate), αλλά εδώ ΈΞΙ
 * ανεξάρτητα per-stage DndContext/SortableContext (vertical), ένα ανά
 * κολόνα σταδίου — η αναδιάταξη είναι πάντα ΕΝΤΟΣ ενός σταδίου.
 */

const ASSIGN_OPTIONS: TaskAssignToStr[] = ['MANAGER', 'PROCESSOR', 'BOTH']

export function TaskTemplatesTab({ programId }: { programId: string }) {
  const [items, setItems] = React.useState<TaskTemplateItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [dialogState, setDialogState] = React.useState<{ stage: StageStr; item: TaskTemplateItem | null } | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    listProgramTaskTemplates(programId)
      .then(setItems)
      .catch(() => setError('Η φόρτωση των βημάτων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [programId])

  React.useEffect(() => { load() }, [load])

  const byStage = React.useMemo(() => {
    const map = new Map<StageStr, TaskTemplateItem[]>()
    for (const stage of STAGE_ORDER) map.set(stage, [])
    for (const it of items) map.get(it.stage)?.push(it)
    for (const list of map.values()) list.sort((a, b) => a.order - b.order)
    return map
  }, [items])

  async function handleDelete(item: TaskTemplateItem) {
    if (!window.confirm(`Διαγραφή του βήματος «${item.title}»;`)) return
    const prev = items
    setItems(prev.filter(i => i.id !== item.id))
    try {
      await deleteProgramTaskTemplate(item.id)
      toast.success('Το βήμα διαγράφηκε.')
    } catch {
      toast.error('Η διαγραφή απέτυχε.')
      setItems(prev)
    }
  }

  async function handleReorder(stage: StageStr, orderedIds: string[]) {
    const prev = items
    setItems(current => {
      const reordered = orderedIds
        .map((id, i) => {
          const found = current.find(it => it.id === id)
          return found ? { ...found, order: i } : null
        })
        .filter((x): x is TaskTemplateItem => x !== null)
      const others = current.filter(it => it.stage !== stage)
      return [...others, ...reordered]
    })
    try {
      await reorderProgramTaskTemplates(programId, stage, orderedIds)
    } catch {
      toast.error('Η αναδιάταξη απέτυχε.')
      setItems(prev)
    }
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {STAGE_ORDER.map(stage => (
          <StageColumn
            key={stage}
            stage={stage}
            items={byStage.get(stage) ?? []}
            loading={loading}
            error={error}
            onAdd={() => setDialogState({ stage, item: null })}
            onEdit={item => setDialogState({ stage, item })}
            onDelete={handleDelete}
            onReorder={orderedIds => handleReorder(stage, orderedIds)}
          />
        ))}
      </div>

      {dialogState && (
        <TaskTemplateDialog
          programId={programId}
          stage={dialogState.stage}
          item={dialogState.item}
          onClose={() => setDialogState(null)}
          onSaved={load}
        />
      )}
    </>
  )
}

function StageColumn({
  stage, items, loading, error, onAdd, onEdit, onDelete, onReorder,
}: {
  stage: StageStr
  items: TaskTemplateItem[]
  loading: boolean
  error: string | null
  onAdd: () => void
  onEdit: (item: TaskTemplateItem) => void
  onDelete: (item: TaskTemplateItem) => void
  onReorder: (orderedIds: string[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(it => it.id === active.id)
    const newIndex = items.findIndex(it => it.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(items, oldIndex, newIndex).map(it => it.id))
  }

  return (
    <section className="glass flex w-[300px] shrink-0 flex-col rounded-[22px] p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <div className="text-[13px] font-extrabold">{stageLabel(stage)}</div>
          <div className="text-[11px] text-muted-foreground">{items.length} {items.length === 1 ? 'βήμα' : 'βήματα'}</div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd} aria-label={`Νέο βήμα — ${stageLabel(stage)}`}>
          <LuPlus className="size-3.5" aria-hidden /> Βήμα
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12px] text-coral">{error}</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-muted-foreground">
          Δεν έχουν οριστεί βήματα για αυτό το στάδιο.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map(it => it.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1.5">
              {items.map(item => (
                <TaskRow key={item.id} item={item} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  )
}

function TaskRow({ item, onEdit, onDelete }: { item: TaskTemplateItem; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-[14px] border border-border bg-card p-2.5',
        isDragging && 'opacity-70 shadow-lg',
        !item.active && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Αναδιάταξη — ${item.title}`}
          className="mt-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 active:cursor-grabbing"
        >
          <LuGripVertical className="size-3.5" aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold break-words">{item.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="badge-pill info">{taskAssignToLabel(item.assignTo)}</span>
            {item.mandatory && <span className="badge-pill warn">Υποχρεωτικό</span>}
            {!item.active && <span className="badge-pill muted">Ανενεργό</span>}
          </div>
          {item.dueOffsetDays != null && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <LuClock3 className="size-3 shrink-0" aria-hidden /> προθεσμία +{item.dueOffsetDays} ημ.
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Επεξεργασία — ${item.title}`}
            title="Επεξεργασία"
          >
            <LuPencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Διαγραφή — ${item.title}`}
            title="Διαγραφή"
          >
            <LuTrash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  )
}

function TaskTemplateDialog({
  programId, stage, item, onClose, onSaved,
}: {
  programId: string
  stage: StageStr
  item: TaskTemplateItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = item !== null
  const [title, setTitle] = React.useState(item?.title ?? '')
  const [description, setDescription] = React.useState(item?.description ?? '')
  const [assignTo, setAssignTo] = React.useState<TaskAssignToStr>(item?.assignTo ?? 'PROCESSOR')
  const [mandatory, setMandatory] = React.useState(item?.mandatory ?? true)
  const [dueOffsetDays, setDueOffsetDays] = React.useState(item?.dueOffsetDays != null ? String(item.dueOffsetDays) : '')
  const [saving, setSaving] = React.useState(false)

  function handleOpenChange(next: boolean) {
    if (saving) return
    if (!next) onClose()
  }

  async function handleSave() {
    const trimmed = title.trim()
    if (!trimmed) {
      toast.error('Ο τίτλος του βήματος είναι υποχρεωτικός.')
      return
    }
    const offsetTrimmed = dueOffsetDays.trim()
    const offsetValue = offsetTrimmed ? Number(offsetTrimmed) : null
    if (offsetTrimmed && !Number.isFinite(offsetValue)) {
      toast.error('Η προθεσμία πρέπει να είναι αριθμός ημερών.')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        await updateProgramTaskTemplate(item.id, {
          title: trimmed,
          description: description.trim() ? description.trim() : null,
          assignTo,
          mandatory,
          dueOffsetDays: offsetValue,
        })
        toast.success('Το βήμα ενημερώθηκε.')
      } else {
        await createProgramTaskTemplate({
          programId, stage, title: trimmed,
          description: description.trim() ? description.trim() : null,
          assignTo, mandatory, dueOffsetDays: offsetValue,
        })
        toast.success('Το βήμα προστέθηκε.')
      }
      onSaved()
      onClose()
    } catch {
      toast.error(isEdit ? 'Η ενημέρωση απέτυχε.' : 'Η προσθήκη απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="glass sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Επεξεργασία βήματος' : 'Νέο βήμα'}</DialogTitle>
          <DialogDescription>
            {stageLabel(stage)} — όρισε τον τίτλο, σε ποιον ανατίθεται, και αν έχει προθεσμία.
          </DialogDescription>
        </DialogHeader>

        <div className="field !mb-0">
          <label htmlFor="tt-title">Τίτλος βήματος</label>
          <div className="inwrap">
            <LuListChecks aria-hidden />
            <Input
              id="tt-title"
              className="!h-auto border-0 bg-transparent p-0 focus-visible:ring-0"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="π.χ. Υποβολή δικαιολογητικών ένταξης"
              autoFocus
              autoComplete="off"
              disabled={saving}
            />
          </div>
        </div>

        <div className="field !mb-0">
          <label htmlFor="tt-desc">Περιγραφή</label>
          <textarea
            id="tt-desc"
            className="cms-textarea"
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="field !mb-0">
            <label htmlFor="tt-assign">Ανατίθεται σε</label>
            <Select value={assignTo} onValueChange={v => setAssignTo(v as TaskAssignToStr)}>
              <SelectTrigger id="tt-assign" aria-label="Ανατίθεται σε" className="h-9 w-full rounded-full border-border bg-card px-3 text-[12.5px]" disabled={saving}>
                <SelectValue>{(v: string) => taskAssignToLabel(v as TaskAssignToStr)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ASSIGN_OPTIONS.map(a => (
                  <SelectItem key={a} value={a}>{taskAssignToLabel(a)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="field !mb-0">
            <label htmlFor="tt-due">Προθεσμία (ημέρες)</label>
            <div className="inwrap">
              <LuClock3 aria-hidden />
              <Input
                id="tt-due"
                className="!h-auto border-0 bg-transparent p-0 focus-visible:ring-0"
                inputMode="numeric"
                value={dueOffsetDays}
                onChange={e => setDueOffsetDays(e.target.value)}
                placeholder="—"
                disabled={saving}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Switch checked={mandatory} onCheckedChange={setMandatory} disabled={saving} id="tt-mandatory" />
          <label htmlFor="tt-mandatory" className="text-[12.5px] font-semibold">Υποχρεωτικό</label>
        </div>

        <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Αποθήκευση…' : (isEdit ? 'Αποθήκευση' : (<><LuPlus className="size-3.5" aria-hidden /> Προσθήκη</>))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
