'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuUpload, LuLoaderCircle, LuSparkles, LuCircleCheck, LuTriangleAlert, LuDownload } from 'react-icons/lu'
import { checkPortalDocument, uploadMyDocument, type MyDocument, type PortalDocCheck } from '@/lib/pm/portal-documents'
import { readForRecognition } from '@/lib/ocr/read-for-recognition'
import { fileToBase64 } from './portal-programs'
import { PModal } from './p-modal'

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const STATUS = { valid: ['ok', 'Σε ισχύ'], expiring: ['warn', 'Λήγει σύντομα'], expired: ['bad', 'Έληξε'] } as const

/** Αποθήκη δικαιολογητικών της επιχείρησης: λίστα + ανέβασμα νέου με αναγνώριση τύπου από AI. */
export function MyDocuments({ documents, types, preview }: { documents: MyDocument[]; types: { id: string; name: string }[]; preview: boolean }) {
  const router = useRouter()
  const q = typeof window !== 'undefined' ? window.location.search : ''
  return (
    <>
      <div>
        <PModal title="Νέο δικαιολογητικό" description="Επιλέξτε το αρχείο (PDF ή φωτογραφία). Ο έλεγχος AI το διαβάζει και αναγνωρίζει τι έγγραφο είναι, την επιχείρηση και τη λήξη." disabled={preview}
          trigger={<><LuUpload aria-hidden /> Ανεβάστε νέο δικαιολογητικό</>}>
          {close => <UploadDocForm types={types} onDone={() => { close(); router.refresh() }} />}
        </PModal>
      </div>

      {documents.length === 0 ? (
        <div className="p-empty"><p className="p-muted">Δεν υπάρχουν ακόμη δικαιολογητικά στο αρχείο της επιχείρησης.</p></div>
      ) : (
        <div className="p-table-wrap">
          <table className="p-table">
            <thead><tr><th>Έγγραφο</th><th>Τύπος</th><th>Λήξη</th><th>Κατάσταση</th><th><span className="sr-only">Λήψη</span></th></tr></thead>
            <tbody>
              {documents.map(d => {
                const [cls, label] = STATUS[d.status]
                return (
                  <tr key={d.id}>
                    <td><b style={{ fontWeight: 500 }}>{d.name}</b>{d.program && <div className="p-muted" style={{ fontSize: 12.5 }}>{d.program}</div>}</td>
                    <td>{d.typeName}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{d.expiresAt ? day(d.expiresAt) : 'Δεν λήγει'}</td>
                    <td><span className={`p-badge ${cls}`}>{label}</span></td>
                    <td><a href={`/api/portal/dossier/${d.id}${q}`} target="_blank" rel="noopener" aria-label={`Λήψη ${d.name}`} style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', gap: 6 }}><LuDownload aria-hidden style={{ width: 16, height: 16 }} /> Άνοιγμα</a></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/** Φόρμα νέου δικαιολογητικού (μέσα σε modal) με αναγνώριση τύπου από AI. */
function UploadDocForm({ types, onDone }: { types: { id: string; name: string }[]; onDone: () => void }) {
  const [file, setFile] = React.useState<File | null>(null)
  const [typeId, setTypeId] = React.useState('')
  const [check, setCheck] = React.useState<PortalDocCheck | null>(null)
  const [phase, setPhase] = React.useState<'idle' | 'checking' | 'ready' | 'uploading'>('idle')

  async function pick(f: File) {
    if (f.size > 8 * 1024 * 1024) { toast.error('Το αρχείο ξεπερνά τα 8MB.'); return }
    setFile(f); setCheck(null); setPhase('checking')
    const payload = await readForRecognition(f)
    const res = await checkPortalDocument({ fileName: f.name, ...(typeId ? { documentTypeId: typeId } : {}), ...payload }).catch(() => null)
    const c = res?.ok ? res.check : null
    setCheck(c)
    if (c?.detectedTypeId && !typeId) setTypeId(c.detectedTypeId)
    setPhase('ready')
  }

  async function save() {
    if (!file || !typeId) { toast.error('Διαλέξτε τύπο εγγράφου.'); return }
    setPhase('uploading')
    const res = await uploadMyDocument({ documentTypeId: typeId, filename: file.name, base64: await fileToBase64(file), mimeType: file.type || 'application/octet-stream', issuedAt: check?.issuedAt ?? null, expiresAt: check?.expiresAt ?? null }).catch(() => null)
    if (res?.ok) { toast.success(res.message); onDone() }
    else { toast.error(res?.message ?? 'Το ανέβασμα απέτυχε.'); setPhase('ready') }
  }

  const tone = check?.verdict === 'match' ? 'ok' : check?.verdict === 'foreign' || check?.verdict === 'expired' ? 'bad' : 'warn'
  return (
      <div className="p-form">
        <div className="row2">
          <label className="p-field">
            <span>Αρχείο</span>
            <input type="file" accept=".pdf,image/*" disabled={phase === 'checking' || phase === 'uploading'} onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f) }} />
          </label>
          <label className="p-field">
            <span>Τύπος εγγράφου</span>
            <select value={typeId} onChange={e => setTypeId(e.target.value)}>
              <option value="">— Επιλέξτε (ή αφήστε το AI να το βρει) —</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
        {phase === 'checking' && <div className="p-review checking" role="status"><LuLoaderCircle className="spin" aria-hidden /> Ο έλεγχος AI διαβάζει το «{file?.name}»…</div>}
        {check && phase !== 'checking' && (
          <div className={`p-review ${tone === 'ok' ? 'checking' : tone}`} role="status" style={tone === 'ok' ? { background: 'var(--p-success-bg)', color: 'var(--p-success)' } : undefined}>
            <div className="msg">{tone === 'ok' ? <LuCircleCheck aria-hidden /> : <LuTriangleAlert aria-hidden />}<span>{check.message}{check.detectedName && check.verdict !== 'match' ? ` (αναγνωρίστηκε: «${check.detectedName}»)` : ''}</span></div>
          </div>
        )}
        <div>
          <button type="button" className="p-btn" disabled={!file || !typeId || phase === 'checking' || phase === 'uploading'} onClick={() => void save()}>
            {phase === 'uploading' ? <LuLoaderCircle className="spin" aria-hidden /> : phase === 'checking' ? <LuSparkles aria-hidden /> : <LuUpload aria-hidden />} Αποθήκευση στα δικαιολογητικά
          </button>
        </div>
      </div>
  )
}
