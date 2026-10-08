'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuFileText, LuLink, LuStickyNote, LuLoaderCircle, LuTrash2, LuRefreshCw, LuSparkles, LuCircleAlert, LuExternalLink, LuPlus, LuBrain,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  listProgramReferences, addProgramReference, updateProgramReference, redigestProgramReference, deleteProgramReference, getProgramReference, importGuideLinks,
  type ProgramReferenceRow,
} from '@/lib/programs/reference-actions'
import { extractPdfLinks } from '@/lib/programs/pdf-text'

/**
 * «Γνωσιακή μνήμη» προγράμματος: συμπληρωματικά αρχεία / URL / σημειώσεις με επεξήγηση. Η AI κρατά σύνοψη
 * κανόνων και τη χρησιμοποιεί σε αξιολόγηση ένταξης, επιλεξιμότητα δαπανών, έλεγχο σχεδίου, σάρωση προσφοράς.
 */

type Kind = ProgramReferenceRow['kind']
const KIND: Record<Kind, { label: string; Icon: typeof LuFileText; hint: string }> = {
  FILE: { label: 'Αρχείο', Icon: LuFileText, hint: 'FAQ, τροποποίηση, ΚΥΑ, οδηγός υποβολής… (PDF, Word, εικόνα)' },
  URL: { label: 'Σύνδεσμος', Icon: LuLink, hint: 'Σελίδα με διευκρινίσεις, ανακοίνωση, FAQ της Διαχειριστικής Αρχής' },
  NOTE: { label: 'Σημείωση', Icon: LuStickyNote, hint: 'Εμπειρία της ομάδας: «η ΔΑ δεν δέχεται…», «προσοχή στο…»' },
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function ProgramReferencesTab({ programId }: { programId: string }) {
  const [rows, setRows] = React.useState<ProgramReferenceRow[] | null>(null)
  const [kind, setKind] = React.useState<Kind>('FILE')
  const [title, setTitle] = React.useState('')
  const [note, setNote] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const [scanningLinks, setScanningLinks] = React.useState(false)

  // Εξωτερικοί σύνδεσμοι του οδηγού → πηγές της μνήμης (η AI τους διαβάζει έναν-έναν).
  async function importLinks() {
    setScanningLinks(true)
    const t = toast.loading('Αναζήτηση συνδέσμων μέσα στον οδηγό…')
    try {
      const res = await fetch(`/api/programs/${programId}/guide`, { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Ο οδηγός δεν βρέθηκε.')
      const links = await extractPdfLinks(await res.arrayBuffer())
      if (!links.length) { toast.info('Ο οδηγός δεν έχει εξωτερικούς συνδέσμους.', { id: t }); return }
      const r = await importGuideLinks(programId, links)
      toast.success(r.added ? `Προστέθηκαν ${r.added} σύνδεσμοι — η AI τους διαβάζει.` : 'Όλοι οι σύνδεσμοι υπάρχουν ήδη στη μνήμη.', { id: t })
      setRows(await listProgramReferences(programId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αναζήτηση απέτυχε.', { id: t })
    } finally {
      setScanningLinks(false)
    }
  }
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let alive = true
    listProgramReferences(programId).then(r => { if (alive) setRows(r) }).catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [programId])

  // Polling για όσα διαβάζονται ακόμη από την AI.
  const processing = rows?.filter(r => r.status === 'PROCESSING').map(r => r.id).join(',') ?? ''
  React.useEffect(() => {
    if (!processing) return
    const iv = setInterval(async () => {
      const ids = processing.split(',')
      const fresh = await Promise.all(ids.map(id => getProgramReference(id).catch(() => null)))
      setRows(prev => prev?.map(r => fresh.find(f => f?.id === r.id) ?? r) ?? prev)
    }, 4000)
    return () => clearInterval(iv)
  }, [processing])

  async function add() {
    if (kind === 'FILE' && !file) { toast.error('Διάλεξε αρχείο.'); return }
    if (kind === 'URL' && !url.trim()) { toast.error('Γράψε τον σύνδεσμο.'); return }
    if (kind === 'NOTE' && !note.trim()) { toast.error('Γράψε τη σημείωση.'); return }
    if (file && file.size > 18 * 1024 * 1024) { toast.error('Το αρχείο ξεπερνά τα 18 MB.'); return }
    setSaving(true)
    try {
      const res = await addProgramReference(programId, {
        kind, title, note, url,
        file: kind === 'FILE' && file ? { name: file.name, base64: await fileToBase64(file), mimeType: file.type } : null,
      })
      if (!res.ok) { toast.error(res.message); return }
      setRows(prev => [res.row, ...(prev ?? [])])
      setTitle(''); setNote(''); setUrl(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      toast.success(kind === 'NOTE' ? 'Η σημείωση προστέθηκε στη μνήμη του προγράμματος.' : 'Προστέθηκε — η AI το διαβάζει…')
    } catch {
      toast.error('Η προσθήκη απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(r: ProgramReferenceRow, active: boolean) {
    setRows(prev => prev?.map(x => (x.id === r.id ? { ...x, active } : x)) ?? prev)
    await updateProgramReference(r.id, { active }).catch(() => toast.error('Η αλλαγή απέτυχε.'))
  }
  async function redigest(r: ProgramReferenceRow) {
    setRows(prev => prev?.map(x => (x.id === r.id ? { ...x, status: 'PROCESSING', error: null } : x)) ?? prev)
    await redigestProgramReference(r.id).catch(() => toast.error('Απέτυχε.'))
  }
  async function remove(r: ProgramReferenceRow) {
    if (!window.confirm(`Διαγραφή της πηγής «${r.title}»;`)) return
    await deleteProgramReference(r.id).catch(() => toast.error('Η διαγραφή απέτυχε.'))
    setRows(prev => prev?.filter(x => x.id !== r.id) ?? prev)
  }

  const active = rows?.filter(r => r.active && (r.status === 'READY')).length ?? 0

  return (
    <div className="flex flex-col gap-4">
      <section className="glass rounded-[22px] p-4">
        <div className="mb-1 flex items-center gap-2 text-[length:var(--fs-13)] font-bold"><LuBrain className="size-4 text-primary" aria-hidden /> Γνωσιακή μνήμη προγράμματος</div>
        <p className="mb-3 text-[length:var(--fs-12)] text-muted-foreground">
          Πρόσθεσε ό,τι γνώση χρειάζεται για αξιολόγηση και τεκμηρίωση πέρα από τον οδηγό: FAQ, τροποποιήσεις, διευκρινίσεις της Διαχειριστικής Αρχής, εμπειρία της ομάδας.
          Η AI το διαβάζει και το λαμβάνει υπόψη στην <b>αξιολόγηση ένταξης πελατών</b>, στην <b>επιλεξιμότητα δαπανών</b>, στον <b>έλεγχο σχεδίου</b> και στη <b>σάρωση προσφορών</b> — και υπερισχύει του αρχικού οδηγού όπου διαφωνεί.
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Είδος πηγής">
          {(Object.keys(KIND) as Kind[]).map(k => {
            const m = KIND[k]
            return (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[length:var(--fs-12)] font-semibold', kind === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
                <m.Icon className="size-3.5" aria-hidden /> {m.label}
              </button>
            )
          })}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="field !mb-0">
            <label htmlFor="ref-title">Τίτλος</label>
            <Input id="ref-title" value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'NOTE' ? 'π.χ. Εμπειρία από προηγούμενο κύκλο' : 'π.χ. FAQ Διαχειριστικής Αρχής (Οκτ. 2026)'} />
          </div>
          {kind === 'URL' && (
            <div className="field !mb-0">
              <label htmlFor="ref-url">Σύνδεσμος</label>
              <Input id="ref-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
            </div>
          )}
          {kind === 'FILE' && (
            <div className="field !mb-0">
              <label htmlFor="ref-file">Αρχείο</label>
              <input id="ref-file" ref={fileRef} type="file" accept=".pdf,.docx,.txt,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-[length:var(--fs-12)] file:mr-2 file:rounded-full file:border file:border-border file:bg-card file:px-3 file:py-1 file:text-[length:var(--fs-12)] file:font-semibold" />
            </div>
          )}
          <div className="field !mb-0 sm:col-span-2">
            <label htmlFor="ref-note">{kind === 'NOTE' ? 'Σημείωση' : 'Επεξήγηση — τι να προσέξει η AI'}</label>
            <textarea id="ref-note" value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder={kind === 'NOTE' ? 'π.χ. Η ΔΑ απορρίπτει προσφορές χωρίς σφραγίδα· οι δαπάνες λογισμικού θέλουν άδεια χρήσης στο όνομα του δικαιούχου.' : 'π.χ. Η ερώτηση 12 αλλάζει το ανώτατο όριο του εξοπλισμού στο 70%· ισχύει από 1/10/2026.'}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-[length:var(--fs-12-5)] outline-none focus:border-ring" />
            <span className="mt-1 block text-[length:var(--fs-11)] text-muted-foreground">{KIND[kind].hint}</span>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={add} disabled={saving}>
            {saving ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuPlus className="size-3.5" aria-hidden />} Προσθήκη στη μνήμη
          </Button>
        </div>
      </section>

      <section className="glass rounded-[22px] p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="dotted-leader flex-1 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
            Πηγές ({rows?.length ?? 0}) · ενεργές στην AI: {active}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={importLinks} disabled={scanningLinks} title="Βρίσκει τους εξωτερικούς συνδέσμους μέσα στο PDF του οδηγού και τους προσθέτει στη μνήμη">
            {scanningLinks ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuLink className="size-3.5" aria-hidden />} Σύνδεσμοι από τον οδηγό
          </Button>
        </div>
        {!rows ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[length:var(--fs-12-5)] text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-[length:var(--fs-12-5)] text-muted-foreground">Δεν έχουν προστεθεί πηγές ακόμη — η AI χρησιμοποιεί μόνο τον οδηγό του προγράμματος.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map(r => {
              const m = KIND[r.kind]
              const expanded = open.has(r.id)
              return (
                <li key={r.id} className={cn('rounded-2xl border border-border bg-card p-3', !r.active && 'opacity-60')}>
                  <div className="flex flex-wrap items-start gap-2.5">
                    <m.Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[length:var(--fs-13)] font-semibold">{r.title}</span>
                        {r.status === 'PROCESSING' && <span className="badge-pill info"><LuLoaderCircle className="size-3 animate-spin" aria-hidden /> η AI το διαβάζει</span>}
                        {r.status === 'READY' && r.kind !== 'NOTE' && <span className="badge-pill ok"><LuSparkles className="size-3" aria-hidden /> διαβάστηκε</span>}
                        {r.status === 'ERROR' && <span className="badge-pill danger" title={r.error ?? undefined}><LuCircleAlert className="size-3" aria-hidden /> σφάλμα</span>}
                        <span className="text-[length:var(--fs-11)] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('el-GR')}</span>
                      </div>
                      {r.url && <a href={r.url} target="_blank" rel="noopener" className="block truncate text-[length:var(--fs-11-5)] text-primary hover:underline">{r.url}</a>}
                      {r.fileName && <a href={`/api/program-references/${r.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[length:var(--fs-11-5)] text-primary hover:underline"><LuExternalLink className="size-3" aria-hidden /> {r.fileName}</a>}
                      {r.note && <p className="mt-1 text-[length:var(--fs-12)]"><b>{r.kind === 'NOTE' ? '' : 'Οδηγία: '}</b>{r.note}</p>}
                      {r.status === 'ERROR' && r.error && <p className="mt-1 text-[length:var(--fs-11-5)] text-(--danger)">{r.error}</p>}
                      {r.digest && (
                        <button type="button" onClick={() => setOpen(s => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} className="mt-1 text-[length:var(--fs-11-5)] font-semibold text-primary hover:underline">
                          {expanded ? 'Απόκρυψη σύνοψης' : 'Τι κράτησε η AI ▾'}
                        </button>
                      )}
                      {expanded && r.digest && <pre className="mt-1.5 max-h-80 overflow-auto rounded-xl bg-muted/50 p-2.5 text-[length:var(--fs-11-5)] whitespace-pre-wrap font-sans">{r.digest}</pre>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <label className="flex items-center gap-1.5 text-[length:var(--fs-11)] text-muted-foreground" title="Ενεργό στις λειτουργίες AI">
                        <Switch checked={r.active} onCheckedChange={v => toggleActive(r, v)} size="sm" /> AI
                      </label>
                      {r.kind !== 'NOTE' && <button type="button" className="rowmenu-btn" title="Ξαναδιάβασμα" aria-label={`Ξαναδιάβασμα ${r.title}`} onClick={() => redigest(r)} disabled={r.status === 'PROCESSING'}><LuRefreshCw className="size-3.5" /></button>}
                      <button type="button" className="rowmenu-btn" title="Διαγραφή" aria-label={`Διαγραφή ${r.title}`} onClick={() => remove(r)}><LuTrash2 className="size-3.5" /></button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
