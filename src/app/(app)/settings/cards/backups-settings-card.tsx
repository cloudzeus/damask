'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { LuFolderCog, LuCalendarClock, LuFolderTree, LuChevronDown, LuChevronUp, LuTerminal } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { Button } from '@/components/ui/button'
import { saveBackupSettings, type BackupSettingsValues } from '../backups-actions'

/**
 * Κάρτα ρυθμίσεων Backups — ΔΕΝ ξαναχρησιμοποιεί το TextField/CardHeader του
 * ../fields.tsx (εκείνα είναι typed πάνω σε LucideIcon από lucide-react, ενώ
 * το MASTER §7 θέλει react-icons/lu για νέο κώδικα — ασύμβατοι icon τύποι).
 * Αντιγράφει το ίδιο ΟΠΤΙΚΟ πρότυπο (ίδια CSS classes .field/.inwrap/.glass)
 * με τοπικό, ελαφρύ markup ώστε να δέχεται IconType.
 */

function Field({
  id, label, icon: Icon, value, onChange, placeholder, help, error, type = 'text',
}: {
  id: string
  label: string
  icon: IconType
  value: string
  onChange: (value: string) => void
  placeholder?: string
  help?: string
  error?: string
  type?: string
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="inwrap">
        <Icon aria-hidden />
        <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      </div>
      {help && !error && <div className="help">{help}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export function BackupsSettingsCard({ initial }: { initial: BackupSettingsValues }) {
  const [values, setValues] = useState<BackupSettingsValues>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initial.pgDumpPath.trim() || initial.pgRestorePath.trim()))
  const [saving, startSave] = useTransition()

  function set<K extends keyof BackupSettingsValues>(key: K, value: BackupSettingsValues[K]) {
    setValues(prev => ({ ...prev, [key]: value }))
    setFieldErrors(errors => {
      if (!(key in errors)) return errors
      const next = { ...errors }
      delete next[key]
      return next
    })
  }

  function handleSave() {
    startSave(async () => {
      const res = await saveBackupSettings(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
    })
  }

  return (
    <div className="glass p-4">
      <div className="mb-3.5 flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <LuFolderCog className="size-4" strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-bold">Ρυθμίσεις</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Διατήρηση αντιγράφων και προαιρετικές διαδρομές εργαλείων PostgreSQL.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <Field
          id="backups-retention"
          label="Διατήρηση (πιο πρόσφατα backups)"
          icon={LuCalendarClock}
          type="number"
          value={values.retentionDays}
          onChange={v => set('retentionDays', v)}
          help="Παλαιότερα διαγράφονται αυτόματα μετά από κάθε επιτυχές backup."
          error={fieldErrors.retentionDays}
        />
        <Field
          id="backups-prefix"
          label="Πρόθεμα διαδρομής στο Bunny"
          icon={LuFolderTree}
          value={values.storagePrefix}
          onChange={v => set('storagePrefix', v)}
          placeholder="backups"
          error={fieldErrors.storagePrefix}
        />
      </div>

      <button
        type="button"
        className="mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setAdvancedOpen(v => !v)}
        aria-expanded={advancedOpen}
      >
        {advancedOpen ? <LuChevronUp className="size-3.5" aria-hidden /> : <LuChevronDown className="size-3.5" aria-hidden />}
        Ρυθμίσεις για προχωρημένους
      </button>

      {advancedOpen && (
        <div className="mt-2 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Field
            id="backups-pgdump"
            label="Διαδρομή pg_dump (προαιρετικό)"
            icon={LuTerminal}
            value={values.pgDumpPath}
            onChange={v => set('pgDumpPath', v)}
            placeholder="αυτόματος εντοπισμός"
            help="Άφησέ το κενό — γίνεται αυτόματος εντοπισμός ανάλογα με την έκδοση του server."
            error={fieldErrors.pgDumpPath}
          />
          <Field
            id="backups-pgrestore"
            label="Διαδρομή pg_restore (προαιρετικό)"
            icon={LuTerminal}
            value={values.pgRestorePath}
            onChange={v => set('pgRestorePath', v)}
            placeholder="αυτόματος εντοπισμός"
            error={fieldErrors.pgRestorePath}
          />
        </div>
      )}

      <div className="mt-3">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
      </div>
    </div>
  )
}
