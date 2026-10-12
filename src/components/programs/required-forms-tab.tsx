'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuPlus, LuTrash2, LuLoaderCircle, LuFileText } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  listProgramRequiredForms, addRequiredForm, updateRequiredForm, removeRequiredForm, listTaxTemplateOptions,
  listReusableFormCatalog, addReusableFormToProgram, listFormProposals, addFormProposals,
  type ProgramRequiredFormItem, type TaxTemplateOption, type ReusableFormItem, type FormProposal,
} from '@/lib/programs/actions'
import { listDocumentTypes, createDocumentType, type DocumentTypeOption } from '@/lib/documents/actions'
import { DELIVERABLE_PHASE_ORDER, deliverablePhaseLabel, type DeliverablePhaseStr } from '@/lib/pm/deliverable-phases'

/** Sentinel τιμή για το «— (κανένας) —» option — το base-ui Select δεν
 * επιτρέπει value="" σε Item. */
const NONE_TEMPLATE = '__none__'
const NONE_PHASE = '__nophase__'
const NONE_DOCTYPE = '__nodoctype__'
const NEW_DOCTYPE = '__newdoctype__'

/**
 * «Έντυπα» tab — απαιτούμενα υποστηρικτικά έντυπα ενός Προγράμματος
 * (ProgramRequiredForm), η αποδελτίωση τα προτείνει ή προστίθενται
 * χειροκίνητα εδώ· κάθε ένα προαιρετικά συνδέεται με έναν «Οδηγό Εντύπου»
 * (TaxFormTemplate) μέσω templateId. Self-fetching client component,
 * mirror του ApplicationsPanel (src/components/programs/applications-panel.tsx).
 */
export function RequiredFormsTab({ programId }: { programId: string }) {
  const [forms, setForms] = React.useState<ProgramRequiredFormItem[]>([])
  const [templates, setTemplates] = React.useState<TaxTemplateOption[]>([])
  const [docTypes, setDocTypes] = React.useState<DocumentTypeOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Manual reload — καλείται από handlers (μετά από save/create/delete), όπου το
  // synchronous setState επιτρέπεται.
  const [proposals, setProposals] = React.useState<FormProposal[]>([])

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([listProgramRequiredForms(programId), listTaxTemplateOptions(), listDocumentTypes(), listFormProposals(programId)])
      .then(([f, t, d, p]) => { setForms(f); setTemplates(t); setDocTypes(d); setProposals(p) })
      .catch(() => setError('Η φόρτωση των εντύπων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [programId])

  // Αρχική φόρτωση — setState ΜΕΤΑ το await (react-hooks/set-state-in-effect).
  React.useEffect(() => {
    let cancelled = false
    Promise.all([listProgramRequiredForms(programId), listTaxTemplateOptions(), listDocumentTypes(), listFormProposals(programId)])
      .then(([f, t, d, p]) => { if (!cancelled) { setForms(f); setTemplates(t); setDocTypes(d); setProposals(p) } })
      .catch(() => { if (!cancelled) setError('Η φόρτωση των εντύπων απέτυχε.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [programId])

  function patchLocal(id: string, patch: Partial<ProgramRequiredFormItem>) {
    setForms(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)))
  }

  async function persist(id: string, patch: { name?: string; notes?: string | null; mandatory?: boolean; templateId?: string | null; phase?: string | null; reusable?: boolean; documentTypeId?: string | null }) {
    try {
      await updateRequiredForm(id, patch)
    } catch {
      toast.error('Η ενημέρωση του εντύπου απέτυχε.')
      load()
    }
  }

  function handlePhaseChange(form: ProgramRequiredFormItem, value: string | null) {
    const phase = !value || value === NONE_PHASE ? null : value
    patchLocal(form.id, { phase })
    void persist(form.id, { phase })
  }

  function handleReusableChange(form: ProgramRequiredFormItem, checked: boolean) {
    patchLocal(form.id, { reusable: checked })
    void persist(form.id, { reusable: checked })
  }

  function handleNameBlur(form: ProgramRequiredFormItem, value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      toast.error('Το όνομα δεν μπορεί να είναι κενό.')
      patchLocal(form.id, { name: form.name })
      return
    }
    if (trimmed === form.name) return
    patchLocal(form.id, { name: trimmed })
    void persist(form.id, { name: trimmed })
  }

  function handleNotesBlur(form: ProgramRequiredFormItem, value: string) {
    const next = value.trim() ? value.trim() : null
    if (next === form.notes) return
    patchLocal(form.id, { notes: next })
    void persist(form.id, { notes: next })
  }

  function handleMandatoryChange(form: ProgramRequiredFormItem, checked: boolean) {
    patchLocal(form.id, { mandatory: checked })
    void persist(form.id, { mandatory: checked })
  }

  function handleTemplateChange(form: ProgramRequiredFormItem, value: string | null) {
    const templateId = !value || value === NONE_TEMPLATE ? null : value
    const template = templates.find(t => t.id === templateId)
    patchLocal(form.id, { templateId, templateName: template ? `${template.name} (${template.code})` : null })
    void persist(form.id, { templateId })
  }

  function handleDocTypeChange(form: ProgramRequiredFormItem, value: string | null) {
    if (value === NEW_DOCTYPE) { void handleCreateTypeFromForm(form); return }
    const documentTypeId = !value || value === NONE_DOCTYPE ? null : value
    const dt = docTypes.find(d => d.id === documentTypeId)
    patchLocal(form.id, { documentTypeId, documentTypeName: dt?.name ?? null })
    void persist(form.id, { documentTypeId })
  }

  // Γρήγορη χαρτογράφηση OCR-εξαγόμενου εντύπου: δημιουργεί τύπο από το όνομα
  // (idempotent) και τον αναθέτει. Default expires=false — ο admin το ρυθμίζει.
  async function handleCreateTypeFromForm(form: ProgramRequiredFormItem) {
    try {
      const t = await createDocumentType(form.name.trim(), false)
      setDocTypes(prev => [...prev.filter(x => x.id !== t.id), t].sort((a, b) => a.name.localeCompare(b.name, 'el')))
      patchLocal(form.id, { documentTypeId: t.id, documentTypeName: t.name })
      await persist(form.id, { documentTypeId: t.id })
      toast.success(`Τύπος «${t.name}» δημιουργήθηκε & αντιστοιχίστηκε.`)
    } catch {
      toast.error('Η δημιουργία τύπου απέτυχε.')
    }
  }

  async function handleRemove(form: ProgramRequiredFormItem) {
    if (!window.confirm(`Διαγραφή του εντύπου «${form.name}»;`)) return
    const prevForms = forms
    setForms(prevForms.filter(f => f.id !== form.id))
    try {
      await removeRequiredForm(form.id)
      toast.success('Το έντυπο διαγράφηκε.')
    } catch {
      toast.error('Η διαγραφή απέτυχε.')
      setForms(prevForms)
    }
  }

  // Combobox με αναζήτηση για τους ΔΙΚΟΥΣ μας τύπους (πολλοί → η απλή λίστα δεν βόλευε).
  const docTypeOptions = React.useMemo(() => docTypes.map(d => ({ value: d.id, label: d.name, hint: d.expires ? 'λήγει' : undefined })), [docTypes])
  const formColumns: DataTableColumn<ProgramRequiredFormItem>[] = [
    {
      id: 'name', header: 'Όνομα', width: 280, enableHide: false, sortValue: f => f.name,
      cell: form => (
        <div className="flex items-center gap-1.5" title={form.name}>
          <LuFileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            defaultValue={form.name}
            title={form.name}
            aria-label={`Όνομα εντύπου — ${form.name}`}
            onBlur={e => handleNameBlur(form, e.target.value)}
            className="w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[length:var(--fs-13)] font-semibold outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          {form.mandatory && !form.documentTypeId && (
            <span className="badge-pill warn shrink-0" title="Δεν έχει αντιστοιχιστεί σε τύπο — δεν θα γίνεται αναγνώριση από την αποθήκη πελάτη">Χωρίς τύπο</span>
          )}
        </div>
      ),
    },
    {
      id: 'phase', header: 'Φάση', width: 170, sortValue: f => f.phase ?? '',
      cell: form => (
        <Select value={form.phase ?? NONE_PHASE} onValueChange={v => handlePhaseChange(form, v)}>
          <SelectTrigger aria-label={`Φάση — ${form.name}`} className="h-8 w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]">
            <SelectValue>{(v: string) => (v === NONE_PHASE ? '— (καμία) —' : deliverablePhaseLabel(v as DeliverablePhaseStr))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_PHASE}>— (καμία) —</SelectItem>
            {DELIVERABLE_PHASE_ORDER.map(p => <SelectItem key={p} value={p}>{deliverablePhaseLabel(p)}</SelectItem>)}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: 'mandatory', header: 'Υποχρεωτικό', width: 110, align: 'center', sortValue: f => f.mandatory,
      cell: form => <Switch checked={form.mandatory} onCheckedChange={checked => handleMandatoryChange(form, checked)} aria-label={`Υποχρεωτικό — ${form.name}`} />,
    },
    {
      id: 'reusable', header: 'Επαναχρ.', width: 90, align: 'center', sortValue: f => f.reusable,
      cell: form => <Switch checked={form.reusable} onCheckedChange={checked => handleReusableChange(form, checked)} aria-label={`Επαναχρησιμοποιήσιμο — ${form.name}`} />,
    },
    {
      id: 'doctype', header: 'Τύπος (αποθήκη)', width: 260,
      sortValue: f => docTypes.find(d => d.id === f.documentTypeId)?.name ?? '',
      cell: form => {
        const current = docTypes.find(d => d.id === form.documentTypeId)?.name
        return (
          <div className="flex items-center gap-1.5" title={current ?? 'Χωρίς τύπο'}>
            <Combobox
              ariaLabel={`Τύπος δικαιολογητικού — ${form.name}`}
              options={[...docTypeOptions, { value: NEW_DOCTYPE, label: `+ Δημιουργία «${form.name.slice(0, 40)}»` }]}
              value={form.documentTypeId}
              onChange={v => handleDocTypeChange(form, v ?? NONE_DOCTYPE)}
              placeholder="Αναζήτηση τύπου…"
              className="w-full min-w-0"
            />
          </div>
        )
      },
    },
    {
      id: 'template', header: 'Οδηγός Εντύπου', width: 220,
      sortValue: f => templates.find(t => t.id === f.templateId)?.name ?? '',
      cell: form => (
        <Select value={form.templateId ?? NONE_TEMPLATE} onValueChange={v => handleTemplateChange(form, v)}>
          <SelectTrigger aria-label={`Οδηγός Εντύπου — ${form.name}`} className="h-8 w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_TEMPLATE}>— (κανένας) —</SelectItem>
            {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.code} {t.name}{t.year ? ` (${t.year})` : ''}</SelectItem>)}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: 'notes', header: 'Σημείωση', width: 200, sortValue: f => f.notes ?? '',
      cell: form => (
        <input
          defaultValue={form.notes ?? ''}
          title={form.notes ?? undefined}
          aria-label={`Σημείωση — ${form.name}`}
          onBlur={e => handleNotesBlur(form, e.target.value)}
          placeholder="—"
          className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[length:var(--fs-12-5)] text-muted-foreground outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:bg-card focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      ),
    },
    {
      id: 'actions', header: '', headerLabel: 'Ενέργειες', width: 48, align: 'center', enableHide: false, enableResize: false,
      cell: form => (
        <button type="button" onClick={() => handleRemove(form)} className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label={`Διαγραφή — ${form.name}`} title="Διαγραφή">
          <LuTrash2 className="size-3.5" aria-hidden />
        </button>
      ),
    },
  ]

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Έντυπα ({forms.length})
        </div>
        <AddRequiredFormDialog programId={programId} onCreated={load} docTypes={docTypes} onTypesChanged={setDocTypes} />
      </div>

      {proposals.length > 0 && (
        <ProposalsPanel programId={programId} proposals={proposals} docTypes={docTypes} onAdded={load} />
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[length:var(--fs-12-5)] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[length:var(--fs-12-5)] text-coral">{error}</p>
      ) : forms.length === 0 ? (
        <p className="py-6 text-center text-[length:var(--fs-12-5)] text-muted-foreground">
          Δεν έχουν οριστεί απαιτούμενα έντυπα. Η αποδελτίωση τα προτείνει, ή πρόσθεσέ τα εδώ.
        </p>
      ) : (
        <DataTable
          tableId="program-required-forms"
          bare
          columns={formColumns}
          rows={forms}
          rowKey={f => f.id}
          searchPlaceholder="Αναζήτηση εντύπου…"
        />
      )}
    </section>
  )
}

function AddRequiredFormDialog({
  programId, onCreated, docTypes, onTypesChanged,
}: {
  programId: string
  onCreated: () => void
  docTypes: DocumentTypeOption[]
  onTypesChanged: (t: DocumentTypeOption[]) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [mandatory, setMandatory] = React.useState(true)
  const [phase, setPhase] = React.useState<string>(NONE_PHASE)
  const [reusable, setReusable] = React.useState(false)
  const [docTypeId, setDocTypeId] = React.useState<string>(NONE_DOCTYPE)
  const [newTypeName, setNewTypeName] = React.useState('')
  const [newTypeExpires, setNewTypeExpires] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [catalog, setCatalog] = React.useState<ReusableFormItem[]>([])

  const creatingType = docTypeId === NEW_DOCTYPE

  function handleOpenChange(next: boolean) {
    if (saving) return
    if (next) { listReusableFormCatalog(programId).then(setCatalog).catch(() => setCatalog([])) }
    else { setName(''); setMandatory(true); setPhase(NONE_PHASE); setReusable(false); setDocTypeId(NONE_DOCTYPE); setNewTypeName(''); setNewTypeExpires(false) }
    setOpen(next)
  }

  async function handleAddFromCatalog(sourceId: string) {
    setSaving(true)
    try {
      await addReusableFormToProgram(programId, sourceId)
      toast.success('Το έντυπο προστέθηκε από τον κατάλογο.')
      onCreated()
      handleOpenChange(false)
    } catch {
      toast.error('Η προσθήκη από τον κατάλογο απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Το όνομα του εντύπου είναι υποχρεωτικό.')
      return
    }
    setSaving(true)
    try {
      let documentTypeId: string | null = docTypeId === NONE_DOCTYPE || docTypeId === NEW_DOCTYPE ? null : docTypeId
      if (creatingType) {
        if (!newTypeName.trim()) { toast.error('Δώσε όνομα τύπου.'); setSaving(false); return }
        const t = await createDocumentType(newTypeName.trim(), newTypeExpires)
        documentTypeId = t.id
        onTypesChanged([...docTypes.filter(x => x.id !== t.id), t].sort((a, b) => a.name.localeCompare(b.name, 'el')))
      }
      await addRequiredForm(programId, { name: trimmed, mandatory, phase: phase === NONE_PHASE ? null : phase, reusable, documentTypeId })
      toast.success('Το έντυπο προστέθηκε.')
      onCreated()
      handleOpenChange(false)
    } catch {
      toast.error('Η προσθήκη απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <LuPlus className="size-3.5" aria-hidden /> Έντυπο
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Νέο απαιτούμενο έντυπο</DialogTitle>
            <DialogDescription>Πρόσθεσε ένα έντυπο που απαιτεί το πρόγραμμα — μπορείς να το συνδέσεις με έναν Οδηγό Εντύπου αργότερα.</DialogDescription>
          </DialogHeader>

          {catalog.length > 0 && (
            <div className="field !mb-0 rounded-[14px] border border-border bg-muted/40 p-2.5">
              <label className="!text-[length:var(--fs-11)]">Από κατάλογο επαναχρησιμοποιήσιμων (άλλα προγράμματα)</label>
              <Combobox
                ariaLabel="Έτοιμο έντυπο από άλλο πρόγραμμα"
                options={catalog.map(c => ({ value: c.sourceId, label: `${c.name}${c.templateName ? ` · ${c.templateName}` : ''}`, hint: c.programTitle }))}
                value={null}
                onChange={v => { if (v && !saving) void handleAddFromCatalog(v) }}
                placeholder="Αναζήτηση έτοιμου εντύπου…"
                className="h-10 w-full"
              />
              <p className="mt-1 text-[length:var(--fs-10-5)] text-muted-foreground">…ή συμπλήρωσε νέο έντυπο παρακάτω.</p>
            </div>
          )}

          <div className="field !mb-0">
            <label htmlFor="rf-name">Όνομα εντύπου</label>
            <div className="inwrap">
              <LuFileText aria-hidden />
              <Input
                id="rf-name"
                className="!h-auto border-0 bg-transparent p-0 focus-visible:ring-0"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="π.χ. Υπεύθυνη Δήλωση Επιχείρησης"
                autoFocus
                autoComplete="off"
                disabled={saving}
              />
            </div>
          </div>

          <div className="field !mb-0">
            <label htmlFor="rf-phase">Φάση προγράμματος</label>
            <Select value={phase} onValueChange={v => setPhase(v ?? NONE_PHASE)}>
              <SelectTrigger id="rf-phase" className="h-10 w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-13)]">
                <SelectValue>
                  {(v: string) => (v === NONE_PHASE ? '— (καμία) —' : deliverablePhaseLabel(v as DeliverablePhaseStr))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_PHASE}>— (καμία) —</SelectItem>
                {DELIVERABLE_PHASE_ORDER.map(p => (
                  <SelectItem key={p} value={p}>{deliverablePhaseLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="field !mb-0">
            <label htmlFor="rf-doctype">Τύπος δικαιολογητικού (αποθήκη πελάτη)</label>
            <Combobox
              id="rf-doctype"
              ariaLabel="Τύπος δικαιολογητικού"
              options={[...docTypes.map(d => ({ value: d.id, label: d.name, hint: d.expires ? 'λήγει' : undefined })), { value: NEW_DOCTYPE, label: '+ Νέος τύπος…' }]}
              value={docTypeId === NONE_DOCTYPE ? null : docTypeId}
              onChange={v => setDocTypeId(v ?? NONE_DOCTYPE)}
              placeholder="Αναζήτηση τύπου…"
              className="h-10 w-full"
            />
            <p className="mt-1 text-[length:var(--fs-10-5)] text-muted-foreground">Αν η εταιρία το έχει ήδη σε ισχύ στην αποθήκη της, δεν θα ξαναζητηθεί.</p>
          </div>

          {creatingType && (
            <div className="field !mb-0 rounded-[14px] border border-border bg-muted/40 p-2.5">
              <label htmlFor="rf-newtype" className="!text-[length:var(--fs-11)]">Όνομα νέου τύπου</label>
              <Input id="rf-newtype" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="π.χ. Φορολογική ενημερότητα" autoComplete="off" disabled={saving} />
              <div className="mt-2 flex items-center gap-2.5">
                <Switch checked={newTypeExpires} onCheckedChange={setNewTypeExpires} disabled={saving} id="rf-newtype-exp" />
                <label htmlFor="rf-newtype-exp" className="text-[length:var(--fs-12-5)] font-semibold">Λήγει (έχει ημερομηνία λήξης)</label>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <Switch checked={mandatory} onCheckedChange={setMandatory} disabled={saving} id="rf-mandatory" />
            <label htmlFor="rf-mandatory" className="text-[length:var(--fs-12-5)] font-semibold">Υποχρεωτικό</label>
          </div>

          <div className="flex items-center gap-2.5">
            <Switch checked={reusable} onCheckedChange={setReusable} disabled={saving} id="rf-reusable" />
            <label htmlFor="rf-reusable" className="text-[length:var(--fs-12-5)] font-semibold">Επαναχρησιμοποιήσιμο σε άλλα έργα</label>
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
            <Button type="button" onClick={handleAdd} disabled={saving || !name.trim()}>
              {saving ? 'Προσθήκη…' : (<><LuPlus className="size-3.5" aria-hidden /> Προσθήκη</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * «Προτάσεις από αποδελτίωση» — τα δικαιολογητικά που εντόπισε το scan του
 * προγράμματος και ΔΕΝ έχουν προστεθεί ακόμη. Ο διαχειριστής επιλέγει ποια θα
 * προσθέσει (με προτεινόμενη αντιστοίχιση τύπου).
 */
function ProposalsPanel({
  programId, proposals, docTypes, onAdded,
}: {
  programId: string
  proposals: FormProposal[]
  docTypes: DocumentTypeOption[]
  onAdded: () => void
}) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(proposals.map(p => p.name)))
  // Τύπος ανά πρόταση: ξεκινά από την πρόταση της αντιστοίχισης και αλλάζει με αναζήτηση στους δικούς μας τύπους.
  const [typeFor, setTypeFor] = React.useState<Record<string, string | null>>(() => Object.fromEntries(proposals.map(p => [p.name, p.suggestedDocumentTypeId])))
  const typeOptions = React.useMemo(() => docTypes.map(d => ({ value: d.id, label: d.name, hint: d.expires ? 'λήγει' : undefined })), [docTypes])
  const [saving, setSaving] = React.useState(false)

  function toggle(name: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  async function handleAdd() {
    const items = proposals.filter(p => selected.has(p.name)).map(p => ({
      name: p.name, mandatory: p.mandatory, notes: p.notes, documentTypeId: typeFor[p.name] ?? null,
    }))
    if (items.length === 0) { toast.error('Επίλεξε τουλάχιστον ένα δικαιολογητικό.'); return }
    setSaving(true)
    try {
      const res = await addFormProposals(programId, items)
      toast.success(`Προστέθηκαν ${res.added} δικαιολογητικά.`)
      onAdded()
    } catch {
      toast.error('Η προσθήκη απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-3 rounded-[16px] border border-dashed border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[length:var(--fs-11-5)] font-semibold text-foreground">
          <LuFileText className="size-3.5 text-muted-foreground" aria-hidden />
          Προτάσεις από αποδελτίωση ({proposals.length}) — επίλεξε ποια θα προσθέσεις
        </div>
        <Button type="button" size="sm" onClick={handleAdd} disabled={saving || selected.size === 0}>
          {saving ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuPlus className="size-3.5" aria-hidden />}
          Προσθήκη επιλεγμένων ({selected.size})
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        {proposals.map(p => (
          <div key={p.name} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-[length:var(--fs-12-5)] hover:bg-muted">
            <input type="checkbox" checked={selected.has(p.name)} onChange={() => toggle(p.name)} aria-label={p.name} className="size-4 shrink-0 accent-[color:var(--primary)]" />
            <span className="min-w-0 flex-1 font-semibold" title={p.name}>{p.name}</span>
            {p.mandatory && <span className="badge-pill warn shrink-0">Υποχρεωτικό</span>}
            {p.suggestionFuzzy && typeFor[p.name] === p.suggestedDocumentTypeId && (
              <span className="badge-pill warn shrink-0" title="Πρόταση βάσει παρόμοιας διατύπωσης — επιβεβαίωσε πριν την προσθήκη">πρόταση</span>
            )}
            <Combobox
              ariaLabel={`Τύπος για «${p.name}»`}
              options={typeOptions}
              value={typeFor[p.name] ?? null}
              onChange={v => setTypeFor(prev => ({ ...prev, [p.name]: v }))}
              placeholder="Χωρίς τύπο — αναζήτηση…"
              className="w-full min-w-0 sm:w-[280px]"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
