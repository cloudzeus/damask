'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuSignature, LuLoaderCircle, LuPlus, LuTrash2, LuSend, LuQrCode, LuCopy, LuExternalLink, LuFileText, LuCircleCheck, LuTriangleAlert } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { CertPreview } from '@/components/supplier-cert/cert-preview'
import type { CertData, CertItem } from '@/lib/supplier-cert/content'
import { getSupplierCert, saveSupplierCert, sendSupplierCert, getCertDefaults, type CertState } from '@/lib/supplier-cert/actions'

const STATUS: Record<CertState['status'], { label: string; cls: string }> = {
  NEW: { label: 'Σύνταξη βεβαίωσης (υποχρεωτική)', cls: 'border-[color:var(--warning)] text-[color:var(--warning)]' },
  DRAFT: { label: 'Βεβαίωση: πρόχειρη', cls: 'border-[color:var(--warning)] text-[color:var(--warning)]' },
  SENT: { label: 'Βεβαίωση: στάλθηκε', cls: 'border-primary text-primary' },
  SIGNED: { label: 'Βεβαίωση: υπογράφηκε', cls: 'border-[color:var(--success)] text-[color:var(--success)]' },
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[length:var(--fs-11-5)] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-[length:var(--fs-13)] font-semibold">
        {title}
        <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="flex flex-col gap-2.5 px-3 pb-3">{children}</div>
    </details>
  )
}

/**
 * «Βεβαίωση προμηθευτή» μιας αγοράς: αυτόματη σύνταξη από τα στοιχεία της (τιμολόγιο, είδη, σειριακοί) με το λεκτικό
 * που καλύπτει όλους τους οδηγούς → αποστολή στον προμηθευτή με σύνδεσμο ή υπογραφή εδώ (QR σε tablet/κινητό).
 */
export function SupplierCertButton({ expenseId, invoiceId = null, status, onChanged, label }: { expenseId: string; invoiceId?: string | null; status: CertState['status']; onChanged: () => void; label?: string }) {
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<CertState | null>(null)
  const [data, setData] = React.useState<CertData | null>(null)
  const [busy, setBusy] = React.useState<'save' | 'send' | null>(null)
  const [email, setEmail] = React.useState('')
  const [note, setNote] = React.useState('')
  const [qr, setQr] = React.useState<string | null>(null)
  const [dirty, setDirty] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const s = await getSupplierCert(expenseId, invoiceId)
      setState(s); setData(s.data); setEmail(s.sentTo ?? s.supplierEmail ?? ''); setDirty(false)
    } catch { toast.error('Η φόρτωση της βεβαίωσης απέτυχε.') }
  }, [expenseId, invoiceId])


  const set = (p: Partial<CertData>) => { setData(d => (d ? { ...d, ...p } : d)); setDirty(true) }
  const setItem = (i: number, p: Partial<CertItem>) => set({ items: data!.items.map((it, j) => (j === i ? { ...it, ...p } : it)) })

  async function save(): Promise<CertState | null> {
    if (!data) return null
    setBusy('save')
    try {
      const s = await saveSupplierCert(expenseId, data, invoiceId)
      setState(s); setData(s.data); setDirty(false)
      toast.success(state?.status === 'SIGNED' ? 'Αποθηκεύτηκε — χρειάζεται νέα υπογραφή.' : 'Η βεβαίωση αποθηκεύτηκε.')
      onChanged()
      return s
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.'); return null } finally { setBusy(null) }
  }
  async function ensureSaved(): Promise<CertState | null> {
    if (state?.id && !dirty) return state
    return save()
  }
  async function send() {
    const s = await ensureSaved()
    if (!s) return
    setBusy('send')
    try {
      const r = await sendSupplierCert(expenseId, { to: email, note }, invoiceId)
      if (!r.ok) { toast.error(r.message); return }
      toast.success(r.message)
      await load()
    } finally { setBusy(null) }
  }
  async function signHere() {
    const s = await ensureSaved()
    if (!s?.link) return
    const QR = await import('qrcode')
    setQr(await QR.toDataURL(s.link, { margin: 1, width: 220 }))
  }

  const current = state?.status ?? status
  const st = STATUS[current]
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); void load() }} className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[length:var(--fs-10-5)] font-semibold hover:border-primary hover:text-primary', st.cls)}>
        {current === 'SIGNED' ? <LuCircleCheck className="size-3" aria-hidden /> : <LuSignature className="size-3" aria-hidden />} {label && current === 'NEW' ? label : st.label}
      </button>
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setQr(null) }}>
        <DialogContent className="sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LuSignature className="size-4 text-primary" aria-hidden /> Βεβαίωση προμηθευτή</DialogTitle>
            <DialogDescription>
              Καινούργιο – αμεταχείριστο – μη παρακράτηση κυριότητας, με το λεκτικό που δέχονται όλοι οι οδηγοί. Συμπληρώστε ό,τι λείπει (κωδικούς, σειριακούς) και στείλτε τη για υπογραφή.
            </DialogDescription>
          </DialogHeader>

          {!data || !state ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Σύνταξη από τα στοιχεία της αγοράς…</div>
          ) : (
            <div className="grid max-h-[72vh] gap-4 overflow-y-auto pr-1 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
              <div className="flex flex-col gap-3">
                {state.status === 'SIGNED' && (
                  <p className="flex items-center gap-2 rounded-lg bg-[color:var(--success)]/10 px-3 py-2 text-[length:var(--fs-12-5)] text-[color:var(--success)]">
                    <LuCircleCheck className="size-4" aria-hidden /> Υπογράφηκε{state.signerName ? ` από ${state.signerName}` : ''}{state.signedAt ? ` στις ${new Date(state.signedAt).toLocaleDateString('el-GR')}` : ''} — βρίσκεται στα έγγραφα αγοράς.
                  </p>
                )}
                {state.status === 'SENT' && (
                  <p className="rounded-lg bg-primary/5 px-3 py-2 text-[length:var(--fs-12-5)]">
                    Στάλθηκε στο {state.sentTo}{state.sentAt ? ` (${new Date(state.sentAt).toLocaleDateString('el-GR')})` : ''} · {state.viewedAt ? 'ο προμηθευτής την άνοιξε' : 'δεν έχει ανοιχτεί ακόμη'}.
                  </p>
                )}

                <Section title="Τιμολόγιο & πρόγραμμα">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Αρ. τιμολογίου"><Input value={data.invoiceNumber} onChange={e => set({ invoiceNumber: e.target.value })} /></Field>
                    <Field label="Ημερομηνία"><Input type="date" value={data.invoiceDate} onChange={e => set({ invoiceDate: e.target.value })} /></Field>
                  </div>
                  <Field label="Πρόγραμμα"><Input value={data.programTitle} onChange={e => set({ programTitle: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Τόπος έκδοσης"><Input value={data.place} onChange={e => set({ place: e.target.value })} placeholder="π.χ. Αθήνα" /></Field>
                    <Field label="Εκδότης">
                      <select value={data.issuerRole} onChange={e => set({ issuerRole: e.target.value as CertData['issuerRole'] })} className="h-9 rounded-md border border-border bg-background px-2 text-[length:var(--fs-13)]">
                        <option value="supplier">Προμηθευτής</option>
                        <option value="manufacturer">Οίκος κατασκευής</option>
                      </select>
                    </Field>
                  </div>
                </Section>

                <Section title={`Είδη (${data.items.length})`}>
                  {data.items.map((it, i) => (
                    <div key={i} className="rounded-lg border border-border p-2">
                      <div className="mb-1.5 flex items-center justify-between text-[length:var(--fs-11-5)] font-semibold text-muted-foreground">
                        Είδος {i + 1}
                        <button type="button" aria-label={`Αφαίρεση είδους ${i + 1}`} disabled={data.items.length === 1} onClick={() => set({ items: data.items.filter((_, j) => j !== i) })} className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-30"><LuTrash2 className="size-3.5" aria-hidden /></button>
                      </div>
                      <Field label="Περιγραφή (μάρκα / μοντέλο)"><Input value={it.description} onChange={e => setItem(i, { description: e.target.value })} /></Field>
                      <div className="mt-2 grid grid-cols-[1fr_80px_70px] gap-2">
                        <Field label="Κωδ. προϊόντος"><Input value={it.code} onChange={e => setItem(i, { code: e.target.value })} /></Field>
                        <Field label="Ποσότητα"><Input value={it.quantity} inputMode="decimal" onChange={e => setItem(i, { quantity: e.target.value })} /></Field>
                        <Field label="Μονάδα"><Input value={it.unit} onChange={e => setItem(i, { unit: e.target.value })} /></Field>
                      </div>
                      <Field label="Σειριακός αριθμός (αν υπάρχει — πολλά S/N χωρισμένα με κόμμα)" className="mt-2"><Input value={it.serial} onChange={e => setItem(i, { serial: e.target.value })} placeholder="—" /></Field>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => set({ items: [...data.items, { code: '', description: '', quantity: '1', unit: '', serial: '' }] })}>
                      <LuPlus className="size-3.5" aria-hidden /> Είδος
                    </Button>
                    <Button
                      type="button" variant="outline" size="sm"
                      title="Ξαναγεμίζει τα είδη (και αρ./ημ. τιμολογίου) από το καταχωρημένο παραστατικό"
                      onClick={async () => {
                        const r = await getCertDefaults(expenseId, invoiceId).catch(() => null)
                        if (!r) { toast.error('Η ανάγνωση απέτυχε.'); return }
                        set({ items: r.data.items, invoiceNumber: r.data.invoiceNumber || data.invoiceNumber, invoiceDate: r.data.invoiceDate || data.invoiceDate })
                        toast.success(r.fromInvoice ? 'Τα είδη συμπληρώθηκαν από το παραστατικό.' : 'Δεν υπάρχει ανάγνωση παραστατικού — συμπληρώθηκαν από τη δαπάνη. Κάντε «AI ανάγνωση παραστατικού» για γραμμές από το τιμολόγιο.')
                      }}
                    >
                      <LuFileText className="size-3.5" aria-hidden /> Από το παραστατικό
                    </Button>
                  </div>
                </Section>

                <Section title="Προμηθευτής & αγοραστής" open={false}>
                  {(['supplier', 'buyer'] as const).map(k => (
                    <div key={k} className="grid grid-cols-2 gap-2">
                      <Field label={k === 'supplier' ? 'Προμηθευτής' : 'Αγοραστής (δικαιούχος)'} className="col-span-2"><Input value={data[k].name} onChange={e => set({ [k]: { ...data[k], name: e.target.value } })} /></Field>
                      <Field label="ΑΦΜ"><Input value={data[k].afm} onChange={e => set({ [k]: { ...data[k], afm: e.target.value } })} /></Field>
                      <Field label="ΔΟΥ"><Input value={data[k].doy} onChange={e => set({ [k]: { ...data[k], doy: e.target.value } })} /></Field>
                      <Field label="Διεύθυνση" className="col-span-2"><Input value={data[k].address} onChange={e => set({ [k]: { ...data[k], address: e.target.value } })} /></Field>
                    </div>
                  ))}
                </Section>

                <Section title="Πρόσθετες δηλώσεις (μόνο όταν ισχύουν)" open={data.vehicle.enabled || data.software || data.paid.enabled}>
                  <label className="flex items-center gap-2 text-[length:var(--fs-13)]"><input type="checkbox" checked={data.vehicle.enabled} onChange={e => set({ vehicle: { ...data.vehicle, enabled: e.target.checked } })} /> Όχημα (αριθμός πλαισίου)</label>
                  {data.vehicle.enabled && <Field label="Αριθμός πλαισίου (VIN)"><Input value={data.vehicle.vin} onChange={e => set({ vehicle: { ...data.vehicle, vin: e.target.value } })} /></Field>}
                  <label className="flex items-center gap-2 text-[length:var(--fs-13)]"><input type="checkbox" checked={data.software} onChange={e => set({ software: e.target.checked })} /> Άδειες λογισμικού</label>
                  <label className="flex items-center gap-2 text-[length:var(--fs-13)]"><input type="checkbox" checked={data.paid.enabled} onChange={e => set({ paid: { ...data.paid, enabled: e.target.checked } })} /> Δήλωση πλήρους εξόφλησης</label>
                  {data.paid.enabled && (
                    <>
                      <p className="flex items-start gap-1.5 text-[length:var(--fs-11-5)] text-[color:var(--warning)]"><LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Μόνο αν το τιμολόγιο έχει πράγματι εξοφληθεί — αλλιώς η δήλωση είναι ψευδής.</p>
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="Ποσό (€)"><Input value={data.paid.amount} onChange={e => set({ paid: { ...data.paid, amount: e.target.value } })} /></Field>
                        <Field label="Ημερομηνία"><Input type="date" value={data.paid.date} onChange={e => set({ paid: { ...data.paid, date: e.target.value } })} /></Field>
                        <Field label="Τρόπος"><Input value={data.paid.method} onChange={e => set({ paid: { ...data.paid, method: e.target.value } })} /></Field>
                      </div>
                    </>
                  )}
                </Section>

                <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={save} disabled={!!busy || (!dirty && !!state.id)}>
                      {busy === 'save' && <LuLoaderCircle className="size-4 animate-spin" aria-hidden />} Αποθήκευση
                    </Button>
                    {state.id && (
                      <Button type="button" variant="outline" nativeButton={false} render={<a href={`/supplier-cert/${expenseId}/pdf${invoiceId ? `?invoice=${invoiceId}` : ''}`} target="_blank" rel="noreferrer" />}>
                        <LuFileText className="size-4" aria-hidden /> PDF
                      </Button>
                    )}
                    <Button type="button" variant="outline" onClick={signHere} disabled={!!busy}>
                      <LuQrCode className="size-4" aria-hidden /> Υπογραφή εδώ
                    </Button>
                  </div>
                  {qr && state.link && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- QR data URL */}
                      <img src={qr} alt="QR για υπογραφή σε κινητό/tablet" className="size-28 rounded bg-white p-1" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[length:var(--fs-12)]">
                        <span>Σκανάρετε με το κινητό/tablet του προμηθευτή ή ανοίξτε τον σύνδεσμο εδώ για υπογραφή με το χέρι.</span>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(state.link!); toast.success('Ο σύνδεσμος αντιγράφηκε.') }}><LuCopy className="size-3.5" aria-hidden /> Αντιγραφή</Button>
                          <Button type="button" size="sm" variant="outline" nativeButton={false} render={<a href={state.link} target="_blank" rel="noreferrer" />}><LuExternalLink className="size-3.5" aria-hidden /> Άνοιγμα</Button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mt-1 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Field label={`Email προμηθευτή${state.supplierName ? ` (${state.supplierName})` : ''}`}>
                      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="info@promitheftis.gr" />
                    </Field>
                    <Button type="button" onClick={send} disabled={!!busy || !email.trim() || state.status === 'SIGNED'}>
                      {busy === 'send' ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuSend className="size-4" aria-hidden />} Αποστολή για υπογραφή
                    </Button>
                  </div>
                  <Field label="Σημείωση στο email (προαιρετικό)"><Input value={note} onChange={e => setNote(e.target.value)} /></Field>
                  {state.hasLogo && <p className="text-[length:var(--fs-11-5)] text-muted-foreground">✓ Ο προμηθευτής έχει ανεβάσει λογότυπο — εμφανίζεται στη βεβαίωση.</p>}
                </div>
              </div>

              <div className="min-w-0 rounded-xl bg-muted/40 p-2 sm:p-4">
                <CertPreview data={data} signer={{ name: state.signerName }} signedAt={state.signedAt} />
                {state.hasLogo && <p className="mt-2 text-center text-[length:var(--fs-11)] text-muted-foreground">Το λογότυπο του προμηθευτή φαίνεται στο PDF.</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
