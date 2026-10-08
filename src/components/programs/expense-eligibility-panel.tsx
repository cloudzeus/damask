'use client'

import { LuCircleCheck, LuCircleX, LuTriangleAlert, LuCircleHelp, LuFileText, LuBookOpen } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import type { ExpenseEligibilityDetail, EligibilityCheckStatus } from '@/lib/programs/expense-eligibility'

/**
 * Αναλυτική τεκμηρίωση επιλεξιμότητας δαπάνης (κοινή για Προϋπολογισμό/προσφορές και Αγορές/παραστατικά).
 * Παλιές αξιολογήσεις χωρίς ανάλυση δείχνουν μόνο το κείμενο (`fallbackNote`).
 */

const STATUS: Record<EligibilityCheckStatus, { label: string; cls: string; Icon: typeof LuCircleCheck; color: string }> = {
  PASS: { label: 'Σύμφωνο', cls: 'ok', Icon: LuCircleCheck, color: 'var(--success)' },
  WARN: { label: 'Προσοχή', cls: 'warn', Icon: LuTriangleAlert, color: 'var(--warning)' },
  FAIL: { label: 'Μη σύμφωνο', cls: 'danger', Icon: LuCircleX, color: 'var(--danger)' },
  UNKNOWN: { label: 'Άγνωστο', cls: 'muted', Icon: LuCircleHelp, color: 'var(--muted-foreground)' },
}
const BASIS: Record<ExpenseEligibilityDetail['basis'], string> = {
  QUOTE: 'βάσει προσφοράς',
  INVOICE: 'βάσει παραστατικού αγοράς',
  DESCRIPTION: 'βάσει περιγραφής (χωρίς προσφορά/παραστατικό)',
}
const EUR = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ExpenseEligibilityPanel({ detail, fallbackNote, amount }: { detail: ExpenseEligibilityDetail | null; fallbackNote?: string | null; amount?: number }) {
  if (!detail) {
    return fallbackNote
      ? <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-[length:var(--fs-11)] text-muted-foreground"><strong>Τεκμηρίωση AI (έλεγξέ τη):</strong> {fallbackNote}</p>
      : null
  }
  const reduced = detail.eligibleAmount != null && amount != null && detail.eligibleAmount < amount - 0.01
  return (
    <div className="mt-1.5 flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-[length:var(--fs-12)]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-11)] text-muted-foreground">
        <span className="font-semibold text-foreground">Τεκμηρίωση επιλεξιμότητας</span>
        <span>· {BASIS[detail.basis]}</span>
        {detail.usedGuidePdf && <span className="inline-flex items-center gap-1">· <LuBookOpen className="size-3" aria-hidden /> με τον οδηγό</span>}
        <span>· {new Date(detail.checkedAt).toLocaleDateString('el-GR')}</span>
        {detail.eligibleAmount != null && (
          <span className={cn('ml-auto font-semibold tabular-nums', reduced ? 'text-(--warning)' : 'text-foreground')}>
            Επιλέξιμο: {EUR.format(detail.eligibleAmount)} €{reduced && amount != null ? ` από ${EUR.format(amount)} €` : ''}
          </span>
        )}
      </div>
      <p className="leading-relaxed">{detail.summary}</p>

      {detail.checks.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {detail.checks.map((c, i) => {
            const m = STATUS[c.status]
            return (
              <li key={i} className="flex items-start gap-2.5 px-2.5 py-2">
                <m.Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: m.color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{c.rule}</div>
                  <div className="text-muted-foreground">{c.explanation}</div>
                  {c.guideRef && <div className="text-[length:var(--fs-11)] text-primary italic">Οδηγός: {c.guideRef}</div>}
                </div>
                <span className={cn('badge-pill shrink-0', m.cls)}>{m.label}</span>
              </li>
            )
          })}
        </ul>
      )}

      {(detail.conditions.length > 0 || detail.requiredDocuments.length > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {detail.conditions.length > 0 && (
            <div>
              <div className="mb-1 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Προϋποθέσεις</div>
              <ul className="flex list-disc flex-col gap-0.5 pl-4">{detail.conditions.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {detail.requiredDocuments.length > 0 && (
            <div>
              <div className="mb-1 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Απαιτούμενα έγγραφα</div>
              <ul className="flex flex-col gap-0.5">{detail.requiredDocuments.map((x, i) => <li key={i} className="flex gap-1.5"><LuFileText className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />{x}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      <p className="text-[length:var(--fs-10-5)] text-muted-foreground">Βοήθημα AI — η τελική κρίση ανήκει στον διαχειριστή.</p>
    </div>
  )
}
