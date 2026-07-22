'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuPlus, LuTrash2, LuLoaderCircle, LuFileText } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  listProgramRequiredForms, addRequiredForm, updateRequiredForm, removeRequiredForm, listTaxTemplateOptions,
  type ProgramRequiredFormItem, type TaxTemplateOption,
} from '@/lib/programs/actions'

/** Sentinel τιμή για το «— (κανένας) —» option — το base-ui Select δεν
 * επιτρέπει value="" σε Item. */
const NONE_TEMPLATE = '__none__'

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
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([listProgramRequiredForms(programId), listTaxTemplateOptions()])
      .then(([f, t]) => { setForms(f); setTemplates(t) })
      .catch(() => setError('Η φόρτωση των εντύπων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [programId])

  React.useEffect(() => { load() }, [load])

  function patchLocal(id: string, patch: Partial<ProgramRequiredFormItem>) {
    setForms(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)))
  }

  async function persist(id: string, patch: { name?: string; notes?: string | null; mandatory?: boolean; templateId?: string | null }) {
    try {
      await updateRequiredForm(id, patch)
    } catch {
      toast.error('Η ενημέρωση του εντύπου απέτυχε.')
      load()
    }
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

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Έντυπα ({forms.length})
        </div>
        <AddRequiredFormDialog programId={programId} onCreated={load} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : forms.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-muted-foreground">
          Δεν έχουν οριστεί απαιτούμενα έντυπα. Η αποδελτίωση τα προτείνει, ή πρόσθεσέ τα εδώ.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Όνομα</th>
                <th className="ctr">Υποχρεωτικό</th>
                <th>Οδηγός Εντύπου</th>
                <th>Σημείωση</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {forms.map(form => (
                <tr key={form.id} className="dotted-row-bottom">
                  <td style={{ minWidth: 160 }}>
                    <div className="flex items-center gap-1.5">
                      <LuFileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <input
                        defaultValue={form.name}
                        onBlur={e => handleNameBlur(form, e.target.value)}
                        className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-semibold outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30"
                      />
                    </div>
                  </td>
                  <td className="ctr">
                    <Switch
                      checked={form.mandatory}
                      onCheckedChange={checked => handleMandatoryChange(form, checked)}
                      aria-label={`Υποχρεωτικό — ${form.name}`}
                    />
                  </td>
                  <td style={{ minWidth: 220 }}>
                    <Select
                      value={form.templateId ?? NONE_TEMPLATE}
                      onValueChange={v => handleTemplateChange(form, v)}
                    >
                      <SelectTrigger aria-label={`Οδηγός Εντύπου — ${form.name}`} className="h-8 w-full rounded-full border-border bg-card px-3 text-[12.5px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_TEMPLATE}>— (κανένας) —</SelectItem>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.code} {t.name}{t.year ? ` (${t.year})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td style={{ minWidth: 180 }}>
                    <input
                      defaultValue={form.notes ?? ''}
                      onBlur={e => handleNotesBlur(form, e.target.value)}
                      placeholder="—"
                      className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] text-muted-foreground outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:bg-card focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                  </td>
                  <td className="ctr">
                    <button
                      type="button"
                      onClick={() => handleRemove(form)}
                      className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Διαγραφή — ${form.name}`}
                      title="Διαγραφή"
                    >
                      <LuTrash2 className="size-3.5" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function AddRequiredFormDialog({ programId, onCreated }: { programId: string; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [mandatory, setMandatory] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  function handleOpenChange(next: boolean) {
    if (saving) return
    if (!next) { setName(''); setMandatory(true) }
    setOpen(next)
  }

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Το όνομα του εντύπου είναι υποχρεωτικό.')
      return
    }
    setSaving(true)
    try {
      await addRequiredForm(programId, { name: trimmed, mandatory })
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

          <div className="flex items-center gap-2.5">
            <Switch checked={mandatory} onCheckedChange={setMandatory} disabled={saving} id="rf-mandatory" />
            <label htmlFor="rf-mandatory" className="text-[12.5px] font-semibold">Υποχρεωτικό</label>
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
