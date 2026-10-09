'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuUserPlus, LuLoaderCircle, LuMail, LuPhone, LuX } from 'react-icons/lu'
import { addTeamMember, removeTeamMember, type TeamMember } from '@/lib/pm/portal-documents'
import { TEAM_ROLES, type TeamRole } from '@/lib/pm/portal-roles'
import { PModal } from './p-modal'

const ROLE_HINT: Record<TeamRole, string> = {
  'Λογιστής': 'Λαμβάνει τα αιτήματα για φορολογικά/λογιστικά έγγραφα (ισολογισμοί, Ε3, ενημερότητες, τιμολόγια).',
  'Υπεύθυνος έργου': 'Λαμβάνει τις ενημερώσεις για την πρόοδο, τις προθεσμίες και τα παραδοτέα του έργου.',
  'Νόμιμος εκπρόσωπος': 'Υπογράφει δηλώσεις και αιτήσεις της επιχείρησης.',
  'Άλλο': 'Συνεργάτης που θέλετε να ενημερώνεται για τα έργα.',
}

/** «Η ομάδα σας»: άτομα της επιχείρησης (λογιστής, υπεύθυνος έργου…) — γίνονται επαφές και λαμβάνουν ειδοποιήσεις. */
export function MyTeam({ members, applications, preview }: { members: TeamMember[]; applications: { applicationId: string; title: string }[]; preview: boolean }) {
  const router = useRouter()

  async function remove(m: TeamMember) {
    if (!window.confirm(`Να σταματήσει ο/η ${m.name} να λαμβάνει ειδοποιήσεις για τα έργα σας;`)) return
    const res = await removeTeamMember(m.id).catch(() => null)
    if (res?.ok) { toast.success(res.message); router.refresh() } else toast.error(res?.message ?? 'Η αφαίρεση απέτυχε.')
  }

  return (
    <>
      <div className="p-card">
        {members.map(m => (
          <div key={m.id} className="p-member">
            <span className="p-avatar" aria-hidden>{m.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <b>{m.name}</b>{m.isMe && <span className="p-muted"> (εσείς)</span>}
              <div className="p-muted" style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                {m.email && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><LuMail aria-hidden style={{ width: 13, height: 13 }} />{m.email}</span>}
                {m.phone && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><LuPhone aria-hidden style={{ width: 13, height: 13 }} />{m.phone}</span>}
              </div>
              {m.programs.length > 0 && <div className="p-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Ειδοποιήσεις για: {m.programs.map(p => p.title).join(' · ')}</div>}
            </div>
            {m.role && <span className="p-badge">{m.role}</span>}
            {m.hasPortal && <span className="p-badge ok">Portal</span>}
            {!m.isMe && m.programs.length > 0 && !preview && (
              <button type="button" className="p-btn p-btn-outline" onClick={() => void remove(m)} aria-label={`Αφαίρεση ${m.name} από τα έργα`}><LuX aria-hidden /> Αφαίρεση</button>
            )}
          </div>
        ))}
      </div>

      <div>
        <PModal title="Προσθήκη ατόμου" description="Π.χ. τον λογιστή σας, ώστε τα αιτήματα για λογιστικά έγγραφα να πηγαίνουν απευθείας σε εκείνον." disabled={preview}
          trigger={<><LuUserPlus aria-hidden /> Προσθήκη ατόμου</>}>
          {close => <TeamForm applications={applications} onDone={() => { close(); router.refresh() }} />}
        </PModal>
      </div>
    </>
  )
}

/** Φόρμα νέου ατόμου (μέσα σε modal). */
function TeamForm({ applications, onDone }: { applications: { applicationId: string; title: string }[]; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const [role, setRole] = React.useState<TeamRole>('Λογιστής')
  const [apps, setApps] = React.useState<string[]>(applications.map(a => a.applicationId))

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    const res = await addTeamMember({
      name: String(fd.get('name') ?? ''), email: String(fd.get('email') ?? ''), phone: String(fd.get('phone') ?? '') || undefined,
      role, applicationIds: apps, portalAccess: fd.get('portal') === 'on',
    }).catch(() => null)
    setBusy(false)
    if (res?.ok) { toast.success(res.message); onDone() }
    else toast.error(res?.message ?? 'Η προσθήκη απέτυχε.')
  }

  return (
        <form className="p-form" onSubmit={e => void submit(e)}>
          <div className="row2">
            <label className="p-field"><span>Ονοματεπώνυμο *</span><input name="name" required minLength={2} autoComplete="name" /></label>
            <label className="p-field"><span>Ρόλος *</span>
              <select value={role} onChange={e => setRole(e.target.value as TeamRole)}>{TEAM_ROLES.map(r => <option key={r}>{r}</option>)}</select>
            </label>
            <label className="p-field"><span>Email *</span><input name="email" type="email" required autoComplete="email" /></label>
            <label className="p-field"><span>Κινητό</span><input name="phone" type="tel" autoComplete="tel" /></label>
          </div>
          <p className="p-muted" style={{ margin: 0, fontSize: 13 }}>{ROLE_HINT[role]}</p>
          {applications.length > 0 && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="p-field" style={{ marginBottom: 6 }}><span>Για ποια έργα θα λαμβάνει ειδοποιήσεις;</span></legend>
              {applications.map(a => (
                <label key={a.applicationId} className="p-check">
                  <input type="checkbox" checked={apps.includes(a.applicationId)}
                    onChange={e => setApps(prev => e.target.checked ? [...prev, a.applicationId] : prev.filter(x => x !== a.applicationId))} />
                  {a.title}
                </label>
              ))}
            </fieldset>
          )}
          <label className="p-check"><input type="checkbox" name="portal" /> Να έχει και πρόσβαση στο portal (θα λάβει email για να ορίσει κωδικό)</label>
          <div><button type="submit" className="p-btn" disabled={busy}>{busy ? <LuLoaderCircle className="spin" aria-hidden /> : <LuUserPlus aria-hidden />} Προσθήκη</button></div>
        </form>
  )
}
