'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuLoaderCircle, LuUpload, LuFileCheck2, LuSparkles, LuTriangleAlert, LuCircleCheck, LuX, LuScanText, LuMail } from 'react-icons/lu'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { OcrUploader } from '@/components/ocr/ocr-uploader'
import type { ExtractedDocument } from '@/lib/ocr/schema'
import { ComposeEmailDialog } from '@/components/email/compose-email-dialog'
import { ExpenseEligibilityPanel } from './expense-eligibility-panel'
import { ExpenseDossierButton } from './expense-dossier-button'
import { evaluateExpenseEligibility } from '@/lib/programs/expense-proposal'
import {
  listExpensePurchases, savePurchaseMeta, uploadPurchaseDoc, removePurchaseDoc, reconcileExpensePurchase, saveInvoiceOcr, draftDocRequestEmail,
  type PurchaseItem, type PurchaseDocKind, type PurchaseVerdict, type DocRequestDraft,
} from '@/lib/programs/expense-purchase'

const EUR = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const DOC_LABELS: { kind: PurchaseDocKind; label: string }[] = [
  { kind: 'invoice', label: 'Παραστατικό' },
  { kind: 'bankExtrait', label: 'Extrait τράπεζας' },
  { kind: 'supplierCert', label: 'Βεβαίωση προμηθευτή' },
]
const VERDICT_META: Record<PurchaseVerdict, { label: string; cls: string }> = {
  OK: { label: 'Τεκμηριωμένη', cls: 'ok' }, MISMATCH: { label: 'Ασυμφωνία', cls: 'warn' }, UNCERTAIN: { label: 'Αβέβαιο', cls: 'muted' },
}
const PAYMENT_STATUS_LABEL: Record<string, string> = { DRAFT: 'Πρόχειρη', SUBMITTED: 'Υποβλήθηκε', APPROVED: 'Εγκρίθηκε', PAID: 'Πληρώθηκε', REJECTED: 'Απορρίφθηκε' }

function readFileBase64(file: File): Promise<{ base64: string; ext: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve({ base64: s.includes(',') ? s.split(',')[1] : s, ext: file.name.includes('.') ? file.name.split('.').pop()! : 'bin' }) }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/**
 * Β2 — «Στοιχεία αγορών & τεκμηρίωση» (φάση υλοποίησης). Ανά εγκεκριμένη δαπάνη:
 * τα 3 έγγραφα αγοράς (παραστατικό/extrait/βεβαίωση) + serial + πληρωμένο ποσό +
 * AI διασταύρωση απέναντι στην εγκεκριμένη δαπάνη. Self-fetching.
 */
const ELIG_META: Record<string, { label: string; cls: string }> = {
  ELIGIBLE: { label: 'Επιλέξιμη', cls: 'ok' }, INELIGIBLE: { label: 'ΜΗ επιλέξιμη', cls: 'warn' }, UNCERTAIN: { label: 'Αβέβαιη', cls: 'muted' },
}

export function PurchaseDocsPanel({ applicationId }: { applicationId: string }) {
  const [items, setItems] = React.useState<PurchaseItem[] | null>(null)
  const load = React.useCallback(() => {
    listExpensePurchases(applicationId).then(setItems).catch(() => toast.error('Αποτυχία φόρτωσης αγορών.'))
  }, [applicationId])
  React.useEffect(() => { load() }, [load])

  if (!items) return <div className="glass flex items-center justify-center gap-2 rounded-[22px] p-8 text-[length:var(--fs-12-5)] text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <div className="dotted-leader flex-1 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">Στοιχεία αγορών & τεκμηρίωση</div>
        <ExpenseDossierButton applicationId={applicationId} />
      </div>
      <p className="mb-3 text-[length:var(--fs-11-5)] text-muted-foreground">Για κάθε εγκεκριμένη δαπάνη ανέβασε <strong>παραστατικό</strong>, <strong>extrait τράπεζας</strong> και <strong>βεβαίωση προμηθευτή</strong>, καταχώρισε το πληρωμένο ποσό/serial, και τρέξε την <strong>AI διασταύρωση</strong> πριν το αίτημα αποπληρωμής.</p>
      {items.length === 0 ? (
        <p className="py-2 text-[length:var(--fs-12)] text-muted-foreground">Δεν υπάρχουν δαπάνες προς υλοποίηση.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map(it => <PurchaseCard key={it.expenseId} item={it} applicationId={applicationId} onReload={load} />)}
        </div>
      )}
    </section>
  )
}

function PurchaseCard({ item: it, applicationId, onReload }: { item: PurchaseItem; applicationId: string; onReload: () => void }) {
  const [serial, setSerial] = React.useState(it.serial ?? '')
  const [paid, setPaid] = React.useState(it.paidAmount != null ? String(it.paidAmount) : '')
  const [reconciling, setReconciling] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const [showElig, setShowElig] = React.useState(false)
  const [showNote, setShowNote] = React.useState(false)
  const [ocrOpen, setOcrOpen] = React.useState(false)
  const [drafting, setDrafting] = React.useState(false)
  const [draft, setDraft] = React.useState<DocRequestDraft | null>(null)
  const [composeOpen, setComposeOpen] = React.useState(false)

  async function draftEmail() {
    setDrafting(true)
    try {
      const res = await draftDocRequestEmail(it.expenseId)
      if (!res.ok) { toast.error(res.message); return }
      setDraft(res.result); setComposeOpen(true)
    } catch { toast.error('Η σύνταξη email απέτυχε.') } finally { setDrafting(false) }
  }

  async function onOcr(data: ExtractedDocument) {
    try {
      await saveInvoiceOcr(it.expenseId, {
        amount: data.totals.gross ?? data.totals.net ?? null,
        supplier: data.issuer.name, docNumber: data.documentNumber, date: data.date,
      })
      setOcrOpen(false)
      toast.success('Το παραστατικό διαβάστηκε.')
      onReload()
    } catch { toast.error('Η αποθήκευση OCR απέτυχε.') }
  }

  async function saveMeta() {
    try {
      await savePurchaseMeta(it.expenseId, { serial: serial.trim() || null, paidAmount: paid.trim() ? Number(paid.replace(',', '.')) : null })
      onReload()
    } catch { toast.error('Η αποθήκευση απέτυχε.') }
  }
  // Επιλεξιμότητα δαπάνης βάσει του ΠΑΡΑΣΤΑΤΙΚΟΥ (π.χ. προγράμματα χωρίς προσφορές) — on demand.
  async function checkEligibility() {
    setChecking(true)
    try {
      const res = await evaluateExpenseEligibility(it.expenseId)
      if (!res.ok) { toast.error(res.message); return }
      toast.success('Ο έλεγχος επιλεξιμότητας ολοκληρώθηκε.')
      setShowElig(true); onReload()
    } catch { toast.error('Ο έλεγχος απέτυχε.') } finally { setChecking(false) }
  }

  async function reconcile() {
    setReconciling(true)
    try {
      const res = await reconcileExpensePurchase(it.expenseId)
      if (!res.ok) { toast.error(res.message); return }
      toast.success('Η διασταύρωση ολοκληρώθηκε.')
      setShowNote(true); onReload()
    } catch { toast.error('Η διασταύρωση απέτυχε.') } finally { setReconciling(false) }
  }

  const vm = it.reconVerdict ? VERDICT_META[it.reconVerdict] : null
  const overpaid = it.paidAmount != null && it.paidAmount > it.amount
  // ασυμφωνία: το OCR-read ποσό του παραστατικού ξεπερνά το εγκεκριμένο (>1% ανοχή)
  const ocrAmountMismatch = it.ocr?.amount != null && it.ocr.amount > it.amount * 1.01

  return (
    <div className="rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-12-5)]">
        <span className="font-semibold">{it.description}</span>
        {it.categoryName && <span className="badge-pill muted shrink-0">{it.categoryName}</span>}
        {it.supplierName && <span className="text-[length:var(--fs-11)] text-muted-foreground">· {it.supplierName}{it.supplierAfm ? ` (${it.supplierAfm})` : ''}</span>}
        {it.inRequest ? (
          <span className="badge-pill ok shrink-0" title="Έχει ενταχθεί σε αίτημα αποπληρωμής">δόση #{it.inRequest.ordinal} · {PAYMENT_STATUS_LABEL[it.inRequest.status] ?? it.inRequest.status}</span>
        ) : (
          <span className="badge-pill muted shrink-0" title="Δεν έχει ενταχθεί σε δόση αποπληρωμής — δες tab «Αποπληρωμές»">εκτός δόσης</span>
        )}
        <span className="ml-auto tabular-nums font-bold">εγκεκριμένο {EUR.format(it.amount)} €</span>
      </div>

      {/* Στοιχεία αγοράς */}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-[length:var(--fs-11-5)] text-muted-foreground">
          Πληρωμένο ποσό
          <Input value={paid} onChange={e => setPaid(e.target.value)} onBlur={saveMeta} inputMode="decimal" placeholder="0,00" className={overpaid ? 'border-[color:var(--coral)]' : undefined} />
        </label>
        <label className="flex items-center gap-2 text-[length:var(--fs-11-5)] text-muted-foreground">
          Serial
          <Input value={serial} onChange={e => setSerial(e.target.value)} onBlur={saveMeta} placeholder="—" />
        </label>
      </div>
      {overpaid && <p className="mt-1 text-[length:var(--fs-11)] font-semibold text-[color:var(--coral)]">Το πληρωμένο ποσό ξεπερνά το εγκεκριμένο.</p>}

      {/* Έγγραφα */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DOC_LABELS.map(({ kind, label }) => (
          <DocChip key={kind} expenseId={it.expenseId} kind={kind} label={label} doc={it.docs[kind]} onReload={onReload} />
        ))}
      </div>

      {/* AI ανάγνωση παραστατικού (OCR) — σύνοψη τι διαβάστηκε */}
      {it.ocr && (
        <p className="mt-1.5 rounded-md bg-muted/60 px-2 py-1 text-[length:var(--fs-11)]">
          <LuScanText className="mr-1 inline size-3 align-[-2px] text-primary" aria-hidden />
          <strong>Διαβάστηκε από παραστατικό:</strong> ποσό <span className={ocrAmountMismatch ? 'font-bold text-[color:var(--coral)]' : 'font-semibold'}>{it.ocr.amount != null ? `${EUR.format(it.ocr.amount)} €` : '—'}</span>
          {it.ocr.supplier ? ` · ${it.ocr.supplier}` : ''}{it.ocr.number ? ` · αρ. ${it.ocr.number}` : ''}
          {ocrAmountMismatch && <span className="ml-1 font-semibold text-[color:var(--coral)]">≠ εγκεκριμένο!</span>}
        </p>
      )}

      {/* Ενέργειες AI */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOcrOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[length:var(--fs-10-5)] font-semibold hover:border-primary hover:text-primary">
          <LuScanText className="size-3" aria-hidden /> {it.ocr ? 'Νέα ανάγνωση' : 'AI ανάγνωση παραστατικού'}
        </button>
        <button type="button" onClick={reconcile} disabled={reconciling} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[length:var(--fs-10-5)] font-semibold hover:border-primary hover:text-primary disabled:opacity-60">
          {reconciling ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuSparkles className="size-3" aria-hidden />} {it.reconVerdict ? 'Ξανά διασταύρωση' : 'AI διασταύρωση'}
        </button>
        {vm && <button type="button" onClick={() => setShowNote(s => !s)} className={`badge-pill ${vm.cls} shrink-0`}>{vm.label} ▾</button>}
        <button type="button" onClick={checkEligibility} disabled={checking} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[length:var(--fs-10-5)] font-semibold hover:border-primary hover:text-primary disabled:opacity-60" title="Μπορεί η δαπάνη να υπαχθεί στο πρόγραμμα; — έλεγχος με τον οδηγό και το παραστατικό">
          {checking ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuSparkles className="size-3" aria-hidden />} {it.eligibilityDetail ? 'Νέος έλεγχος επιλεξιμότητας' : 'Έλεγχος επιλεξιμότητας'}
        </button>
        {it.eligibilityDetail && (
          <button type="button" onClick={() => setShowElig(v => !v)} className={`badge-pill shrink-0 ${ELIG_META[it.eligibilityDetail.verdict].cls}`}>{ELIG_META[it.eligibilityDetail.verdict].label} ▾</button>
        )}
        {it.missingDocs.length > 0 && <span className="inline-flex items-center gap-1 text-[length:var(--fs-10-5)] text-[color:var(--warning)]"><LuTriangleAlert className="size-3" aria-hidden /> λείπουν: {it.missingDocs.join(', ')}</span>}
        {it.missingDocs.length === 0 && <span className="inline-flex items-center gap-1 text-[length:var(--fs-10-5)] text-[color:var(--success)]"><LuCircleCheck className="size-3" aria-hidden /> όλα τα έγγραφα</span>}
        {it.missingDocs.length > 0 && (
          <button type="button" onClick={draftEmail} disabled={drafting} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[length:var(--fs-10-5)] font-semibold hover:border-primary hover:text-primary disabled:opacity-60" title="AI email που ζητά τα έγγραφα που λείπουν">
            {drafting ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuMail className="size-3" aria-hidden />} AI email αιτήματος
          </button>
        )}
      </div>
      {draft && (
        <ComposeEmailDialog
          key={`${it.expenseId}-${composeOpen}`}
          open={composeOpen}
          onOpenChange={setComposeOpen}
          showTrigger={false}
          trdrId={draft.trdrId}
          applicationId={applicationId}
          defaultSubject={draft.subject}
          defaultBody={draft.body}
        />
      )}
      {showElig && it.eligibilityDetail && <ExpenseEligibilityPanel detail={it.eligibilityDetail} amount={it.amount} />}
      {showNote && it.reconNote && (
        <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-[length:var(--fs-11)] text-muted-foreground"><strong>AI τεκμηρίωση:</strong> {it.reconNote}</p>
      )}

      <Dialog open={ocrOpen} onOpenChange={setOcrOpen}>
        <DialogContent className="glass sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LuScanText className="size-4 text-primary" aria-hidden /> Ανάγνωση παραστατικού</DialogTitle>
            <DialogDescription>Ανέβασε/τράβηξε το παραστατικό — το AI διαβάζει ποσό/προμηθευτή/αριθμό και τα συγκρίνει με την εγκεκριμένη δαπάνη.</DialogDescription>
          </DialogHeader>
          <OcrUploader title="Ανάγνωση παραστατικού" docTypeHint="invoice" onConfirm={onOcr} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DocChip({ expenseId, kind, label, doc, onReload }: { expenseId: string; kind: PurchaseDocKind; label: string; doc: { has: boolean; name: string | null }; onReload: () => void }) {
  const fileRef = React.useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function upload(file: File) {
    setBusy(true)
    try {
      const { base64, ext } = await readFileBase64(file)
      await uploadPurchaseDoc(expenseId, kind, { name: file.name, base64, mimeType: file.type || 'application/octet-stream', ext })
      toast.success(`${label}: ανέβηκε.`); onReload()
    } catch { toast.error('Το ανέβασμα απέτυχε.') } finally { setBusy(false) }
  }
  async function remove() {
    try { await removePurchaseDoc(expenseId, kind); onReload() } catch { toast.error('Η αφαίρεση απέτυχε.') }
  }

  if (doc.has) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--success)]/10 px-2 py-0.5 text-[length:var(--fs-10-5)]">
        <a href={`/expense-purchase/${expenseId}/${kind}`} className="inline-flex items-center gap-1 font-semibold text-[color:var(--success)]"><LuFileCheck2 className="size-3" aria-hidden /> {label}</a>
        <button type="button" onClick={remove} className="text-muted-foreground hover:text-[color:var(--coral)]" title="Αφαίρεση"><LuX className="size-3" aria-hidden /></button>
      </span>
    )
  }
  return (
    <>
      <input ref={fileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[length:var(--fs-10-5)] text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-60">
        {busy ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuUpload className="size-3" aria-hidden />} {label}
      </button>
    </>
  )
}
