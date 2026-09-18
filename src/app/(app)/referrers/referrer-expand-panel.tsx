'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LoaderCircle, Building2, UserPlus, ExternalLink, RefreshCw, Users, Contact, Plus, Pencil, Trash2, Check, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  listReferrerLinkedCompanies, linkReferrerCompanyToPrograms, type ReferrerLinkedCompany,
} from '@/lib/referrals/actions'
import {
  listReferrerContacts, addReferrerContact, updateReferrerContact, removeReferrerContact,
  type ReferrerContactRow, type ReferrerContactInput,
} from '@/lib/referrers/actions'
import { ReferrerEligiblePanel } from './referrer-eligible-panel'

/**
 * Expanded panel μιας παραπομπής (3 ενότητες):
 *  1. Συσχετισμένες εταιρίες (Trdr που έφερε) + έλεγχος επιλεξιμότητας σε προγράμματα.
 *  2. Επαφές (ReferrerContact) — για εταιρίες-παραπομπές (πολλά πρόσωπα).
 *  3. Επιλέξιμες από χαρτογράφηση Excel (proto-prospects) — υπάρχον ReferrerEligiblePanel.
 */
export function ReferrerExpandPanel({
  referrerId, referrerName, referrerType, refreshToken, onRunUpload, onChanged,
}: {
  referrerId: string
  referrerName: string
  referrerType: 'COMPANY' | 'INDIVIDUAL'
  refreshToken: number
  onRunUpload: () => void
  onChanged: () => void
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border bg-muted/30 p-3">
      <LinkedCompanies referrerId={referrerId} refreshToken={refreshToken} onChanged={onChanged} />
      {referrerType === 'COMPANY' && <ContactsSection referrerId={referrerId} onChanged={onChanged} />}
      <div className="rounded-2xl border border-border bg-card/40">
        <ReferrerEligiblePanel
          referrerId={referrerId}
          referrerName={referrerName}
          refreshToken={refreshToken}
          onRunUpload={onRunUpload}
          onChanged={onChanged}
        />
      </div>
    </div>
  )
}

// ── 1. Συσχετισμένες εταιρίες + έλεγχος επιλεξιμότητας ────────────────────────
function LinkedCompanies({ referrerId, refreshToken, onChanged }: { referrerId: string; refreshToken: number; onChanged: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [rows, setRows] = React.useState<ReferrerLinkedCompany[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const reload = React.useCallback(() => {
    const t = setTimeout(() => {
      setLoading(true)
      setError(null)
      listReferrerLinkedCompanies(referrerId)
        .then(r => { setRows(r); setLoading(false) })
        .catch((e: unknown) => { setError(e instanceof Error ? e.message : 'Ο έλεγχος επιλεξιμότητας απέτυχε.'); setRows([]); setLoading(false) })
    }, 0)
    return () => clearTimeout(t)
  }, [referrerId])

  React.useEffect(() => reload(), [reload, refreshToken])

  async function linkAll(r: ReferrerLinkedCompany) {
    const ids = r.eligiblePrograms.map(p => p.programId)
    if (ids.length === 0) return
    setBusyId(r.trdrId)
    try {
      const res = await linkReferrerCompanyToPrograms(r.trdrId, ids)
      if (!res.ok) { toast.error(res.message ?? 'Η ένταξη απέτυχε.'); return }
      toast.success(`Εντάχθηκε σε ${res.linked} προγράμματα.`, {
        action: { label: 'Άνοιγμα καρτέλας', onClick: () => router.push(`/partners/${r.trdrId}`) },
      })
      onChanged()
      reload()
    } catch {
      toast.error('Η ένταξη απέτυχε.')
    } finally { setBusyId(null) }
  }

  const eligibleCount = rows.reduce((n, r) => n + (r.eligiblePrograms.length > 0 ? 1 : 0), 0)
  const noKadCount = rows.reduce((n, r) => n + (r.kadCount === 0 ? 1 : 0), 0)

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          <Users className="size-3.5" aria-hidden /> Συσχετισμένες εταιρίες ({rows.length})
        </span>
        <div className="flex items-center gap-2">
          {!loading && rows.length > 0 && <span className="badge-pill ok">{eligibleCount} με νέα επιλέξιμα</span>}
          {!loading && noKadCount > 0 && <span className="badge-pill warn" title="Εταιρίες χωρίς αποθηκευμένους ΚΑΔ — τρέξε «Μαζικός εντοπισμός ΚΑΔ» (ΑΑΔΕ) στους δυνητικούς/πελάτες για να ελεγχθεί η επιλεξιμότητα">{noKadCount} χωρίς ΚΑΔ</span>}
          <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden /> Έλεγχος επιλεξιμότητας
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-5 text-[0.78125rem] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Έλεγχος…
        </div>
      ) : error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[0.75rem] text-destructive">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-[0.75rem] text-muted-foreground">
          Καμία καταχωρημένη εταιρία (πελάτης ή δυνητικός) δεν έχει συσχετιστεί με αυτή τη σύσταση ακόμη.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.78125rem]">
            <thead>
              <tr className="text-left text-[0.6875rem] font-bold text-muted-foreground uppercase">
                <th className="py-1.5 pr-3">Εταιρία</th>
                <th className="py-1.5 pr-3">Κατάσταση</th>
                <th className="py-1.5 pr-3">Περιοχή</th>
                <th className="py-1.5 pr-3">Νέα επιλέξιμα προγράμματα</th>
                <th className="py-1.5 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.trdrId} className="border-t border-border align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/partners/${r.trdrId}`} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> {r.name}
                    </Link>
                    {r.afm && <div className="text-[0.6875rem] text-muted-foreground tabular-nums">{r.afm}</div>}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={cn('badge-pill', r.isCustomer ? 'ok' : 'muted')}>{r.isCustomer ? 'Πελάτης' : 'Δυνητικός'}</span>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{r.regionName ?? '—'}</td>
                  <td className="py-2 pr-3">
                    {r.eligiblePrograms.length === 0
                      ? (r.kadCount === 0
                          ? <span className="badge-pill warn" title="Δεν υπάρχουν αποθηκευμένοι ΚΑΔ — δεν μπορεί να ελεγχθεί η επιλεξιμότητα. Τρέξε «Μαζικός εντοπισμός ΚΑΔ» (ΑΑΔΕ).">χωρίς ΚΑΔ</span>
                          : <span className="text-muted-foreground">{r.currentProgramIds.length > 0 ? 'ήδη ενταγμένη' : '—'}</span>)
                      : (
                        <div className="flex flex-wrap gap-1">
                          {r.eligiblePrograms.map(p => (
                            <span key={p.programId} className="badge-pill ok shrink-0">
                              {p.title}{p.fundingRate != null ? ` · ${p.fundingRate}%` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {r.eligiblePrograms.length > 0 && (
                      <Button type="button" size="sm" disabled={busyId === r.trdrId} onClick={() => linkAll(r)}>
                        {busyId === r.trdrId
                          ? <><LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Ένταξη…</>
                          : <><UserPlus className="size-3.5" aria-hidden /> Ένταξη</>}
                      </Button>
                    )}
                    <Link href={`/partners/${r.trdrId}`} className="ml-1 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" title="Άνοιγμα καρτέλας">
                      <ExternalLink className="size-3.5" aria-hidden />
                    </Link>
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

// ── 2. Επαφές (πολλά πρόσωπα) — μόνο για εταιρίες ─────────────────────────────
function ContactsSection({ referrerId, onChanged }: { referrerId: string; onChanged: () => void }) {
  const [loading, setLoading] = React.useState(true)
  const [rows, setRows] = React.useState<ReferrerContactRow[]>([])
  const [adding, setAdding] = React.useState(false)
  const [editId, setEditId] = React.useState<string | null>(null)

  const reload = React.useCallback(() => {
    const t = setTimeout(() => {
      setLoading(true)
      listReferrerContacts(referrerId).then(r => { setRows(r); setLoading(false) }).catch(() => { setRows([]); setLoading(false) })
    }, 0)
    return () => clearTimeout(t)
  }, [referrerId])
  React.useEffect(() => reload(), [reload])

  async function remove(id: string) {
    if (!window.confirm('Διαγραφή επαφής;')) return
    try { await removeReferrerContact(id); toast.success('Η επαφή διαγράφηκε.'); onChanged(); reload() }
    catch { toast.error('Η διαγραφή απέτυχε.') }
  }

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          <Contact className="size-3.5" aria-hidden /> Επαφές ({rows.length})
        </span>
        {!adding && (
          <Button type="button" variant="outline" size="sm" onClick={() => { setAdding(true); setEditId(null) }}>
            <Plus className="size-3.5" aria-hidden /> Νέα επαφή
          </Button>
        )}
      </div>

      {adding && (
        <ContactForm
          referrerId={referrerId}
          onCancel={() => setAdding(false)}
          onSaved={() => { setAdding(false); onChanged(); reload() }}
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-[0.78125rem] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : rows.length === 0 && !adding ? (
        <p className="py-3 text-[0.75rem] text-muted-foreground">Δεν υπάρχουν επαφές. Πρόσθεσε πρόσωπα επικοινωνίας για αυτή την εταιρία-παραπομπή.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map(c => editId === c.id ? (
            <ContactForm
              key={c.id}
              referrerId={referrerId}
              editing={c}
              onCancel={() => setEditId(null)}
              onSaved={() => { setEditId(null); onChanged(); reload() }}
            />
          ) : (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2 text-[0.78125rem]">
              <span className="font-semibold">{c.name}</span>
              {c.role && <span className="badge-pill muted">{c.role}</span>}
              {c.email && <a href={`mailto:${c.email}`} className="text-[0.71875rem] text-info hover:underline">{c.email}</a>}
              {c.phone && <a href={`tel:${c.phone}`} className="text-[0.71875rem] text-muted-foreground hover:underline">{c.phone}</a>}
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => { setEditId(c.id); setAdding(false) }} className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" title="Επεξεργασία"><Pencil className="size-3.5" aria-hidden /></button>
                <button type="button" onClick={() => remove(c.id)} className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Διαγραφή"><Trash2 className="size-3.5" aria-hidden /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ContactForm({ referrerId, editing, onCancel, onSaved }: {
  referrerId: string
  editing?: ReferrerContactRow
  onCancel: () => void
  onSaved: () => void
}) {
  const [name, setName] = React.useState(editing?.name ?? '')
  const [role, setRole] = React.useState(editing?.role ?? '')
  const [email, setEmail] = React.useState(editing?.email ?? '')
  const [phone, setPhone] = React.useState(editing?.phone ?? '')
  const [saving, setSaving] = React.useState(false)

  async function save() {
    if (!name.trim()) { toast.error('Το όνομα είναι υποχρεωτικό.'); return }
    setSaving(true)
    const input: ReferrerContactInput = { name, role: role || null, email: email || null, phone: phone || null }
    try {
      if (editing) await updateReferrerContact(editing.id, input)
      else await addReferrerContact(referrerId, input)
      toast.success(editing ? 'Η επαφή ενημερώθηκε.' : 'Η επαφή προστέθηκε.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.')
    } finally { setSaving(false) }
  }

  return (
    <div className="mb-1.5 grid grid-cols-1 gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 sm:grid-cols-[1.4fr_1fr_1.4fr_1fr_auto]">
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ονοματεπώνυμο*" className="h-8" />
      <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Θέση" className="h-8" />
      <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" className="h-8" />
      <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Τηλέφωνο" className="h-8" />
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" onClick={save} disabled={saving} aria-label="Αποθήκευση">
          {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving} aria-label="Άκυρο">
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
