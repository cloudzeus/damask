'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LuBuilding2, LuCircleCheck, LuCircleX, LuClock3, LuChevronRight, LuCheck, LuUserRound,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { setApplicationStage, type ApplicationDetail } from '@/lib/pm/actions'
import { STAGE_ORDER, stageLabel, nextStage, verdictLabel, type StageStr, type VerdictStr } from '@/lib/pm/types'
import { AssignApplicationDialog } from './assign-application-dialog'
import { AssessmentTab } from './assessment-tab'
import { ObligationsTab } from './obligations-tab'
import { ExpensesTab } from './expenses-tab'
import { OpskeTab } from './opske-tab'
import { CertificationTab } from './certification-tab'
import { PaymentsTab } from './payments-tab'
import { DocumentRequestsTab } from './document-requests-tab'
import { PortalAccessDialog } from './portal-access-dialog'

/**
 * Το «Έργο hub» (Task 10) — κεντρική οθόνη PM για μία αίτηση προγράμματος:
 * header (πελάτης/πρόγραμμα + verdict/βαθμολογία), assignment row, stage
 * stepper (STAGE_ORDER, με ελεύθερο jump + «Επόμενο στάδιο»), και tab bar
 * που φιλοξενεί τη ροή εργασίας: Αξιολόγηση (Task 11), Εργασίες &
 * Υποχρεώσεις (Task 12, ονομασία C2e), Δαπάνες (Task 13 — wrapper πάνω στο C3
 * <ExpenseList>), Παραδοτέα (Task 13 — <ObligationsTab filterKind=
 * "DELIVERABLE">, ίδιο component με το tab Υποχρεώσεων αλλά φιλτραρισμένη
 * προβολή) και ΟΠΣΚΕ (Task 13). Mirror του TabBar idiom από
 * program-editor.tsx (useState<TabKey> + pill row, όχι Tabs primitive).
 *
 * ΣΗΜΑΝΤΙΚΟ: τα actions εδώ κάνουν revalidatePath('/pm/applications/...')
 * που ΔΕΝ ταιριάζει με το πραγματικό route (/programs/[id]/applications/
 * [appId]) — γι' αυτό μετά από ΚΑΘΕ mutation καλούμε ρητά router.refresh()
 * αντί να βασιζόμαστε στο server-side revalidate.
 */
export function ApplicationHub({ app }: { app: ApplicationDetail }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = React.useState<TabKey>('assessment')
  const [changingStage, setChangingStage] = React.useState(false)

  const next = nextStage(app.stage)

  function handleStageChange(stage: StageStr) {
    if (stage === app.stage || changingStage) return
    setChangingStage(true)
    setApplicationStage(app.id, stage)
      .then(({ pendingMandatory }) => {
        if (pendingMandatory > 0) {
          toast.warning(`Υπάρχουν ${pendingMandatory} εκκρεμείς υποχρεώσεις.`)
        } else {
          toast.success('Το στάδιο ενημερώθηκε.')
        }
        router.refresh()
      })
      .catch(() => toast.error('Η αλλαγή σταδίου απέτυχε.'))
      .finally(() => setChangingStage(false))
  }

  const scorePct = app.assessmentScore != null && app.assessmentMaxScore
    ? Math.round((app.assessmentScore / app.assessmentMaxScore) * 100)
    : null

  return (
    <div className="flex flex-col gap-4">
      {/* Header — πελάτης/πρόγραμμα + verdict/βαθμολογία */}
      <div className="glass rounded-[22px] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <LuBuilding2 className="size-3" aria-hidden /> Πελάτης
            </div>
            <h2 className="text-[19px] font-bold">{app.trdrName}</h2>
            <Link href={`/programs/${app.programId}`} className="text-[12.5px] text-muted-foreground hover:text-foreground hover:underline">
              {app.programTitle}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={app.assessmentVerdict} />
            {scorePct != null && <span className="badge-pill info">Βαθμολογία {scorePct}%</span>}
          </div>
        </div>

        {/* Assignment row */}
        <div className="mt-3 flex flex-wrap items-center gap-2.5 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            <LuUserRound className="size-3.5" aria-hidden /> Διαχειριστής
          </span>
          <span className="badge-pill muted">{app.managerName ?? '—'}</span>
          <span className="text-[11.5px] font-semibold text-muted-foreground">Διεκπεραιωτής</span>
          <span className="badge-pill muted">{app.processorName ?? '—'}</span>
          <div className="ml-auto flex items-center gap-2">
            <PortalAccessDialog applicationId={app.id} />
            {app.canManage && (
              <AssignApplicationDialog
                app={{ id: app.id, managerId: app.managerId, processorId: app.processorId }}
                onAssigned={() => router.refresh()}
              />
            )}
          </div>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="glass rounded-[22px] p-4">
        <StageStepper stage={app.stage} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <div className="field !mb-0">
            <label htmlFor="pm-stage-jump">Μετάβαση σε στάδιο</label>
            <Select value={app.stage} onValueChange={v => handleStageChange(v as StageStr)} disabled={changingStage}>
              <SelectTrigger id="pm-stage-jump" className="h-10 w-64 rounded-full border-border bg-card px-4">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map(s => (
                  <SelectItem key={s} value={s}>{stageLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={() => next && handleStageChange(next)} disabled={!next || changingStage}>
            {changingStage ? 'Ενημέρωση…' : (<>Επόμενο στάδιο <LuChevronRight className="size-3.5" aria-hidden /></>)}
          </Button>
        </div>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === 'assessment' && <AssessmentTab applicationId={app.id} canManage={app.canManage} />}
      {activeTab === 'obligations' && <ObligationsTab applicationId={app.id} canManage={app.canManage} programId={app.programId} />}
      {activeTab === 'expenses' && <ExpensesTab applicationId={app.id} programId={app.programId} />}
      {activeTab === 'deliverables' && (
        <ObligationsTab
          applicationId={app.id}
          canManage={app.canManage}
          programId={app.programId}
          filterKind="DELIVERABLE"
          title="Παραδοτέα"
          emptyMessage="Δεν υπάρχουν παραδοτέα για αυτή την αίτηση."
          showBoardToggle={false}
        />
      )}
      {activeTab === 'opske' && (
        <OpskeTab
          applicationId={app.id}
          canManage={app.canManage}
          opskeStatus={app.opskeStatus}
          opskeRef={app.opskeRef}
          opskeSubmittedAt={app.opskeSubmittedAt}
        />
      )}
      {activeTab === 'certification' && <CertificationTab applicationId={app.id} programId={app.programId} />}
      {activeTab === 'docrequests' && <DocumentRequestsTab applicationId={app.id} />}
      {activeTab === 'payments' && <PaymentsTab applicationId={app.id} />}
    </div>
  )
}

/* ── Verdict badge — coral μόνο για INELIGIBLE (§4β: coral ΜΟΝΟ για data
 * highlights/alerts), ok/success για ELIGIBLE, muted για PENDING. ── */
function VerdictBadge({ verdict }: { verdict: VerdictStr }) {
  if (verdict === 'ELIGIBLE') {
    return <span className="badge-pill ok"><LuCircleCheck className="size-3" aria-hidden /> {verdictLabel(verdict)}</span>
  }
  if (verdict === 'INELIGIBLE') {
    return (
      <span className="badge-pill" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>
        <LuCircleX className="size-3" aria-hidden /> {verdictLabel(verdict)}
      </span>
    )
  }
  return <span className="badge-pill muted"><LuClock3 className="size-3" aria-hidden /> {verdictLabel(verdict)}</span>
}

/* ── Stage stepper — οριζόντια σειρά των 6 STAGE_ORDER labels, το τρέχον
 * navy/primary, τα ολοκληρωμένα με check, τα μελλοντικά muted. ── */
function StageStepper({ stage }: { stage: StageStr }) {
  const currentIndex = STAGE_ORDER.indexOf(stage)
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Στάδιο έργου">
      {STAGE_ORDER.map((s, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <li key={s} className="flex items-center gap-1.5">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors',
                active && 'bg-primary text-primary-foreground shadow-sm',
                !active && done && 'text-[color:var(--success)]',
                !active && !done && 'text-muted-foreground',
              )}
              style={!active && done ? { background: 'var(--success-soft)' } : undefined}
            >
              <span
                className={cn(
                  'flex size-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold',
                  active && 'bg-primary-foreground/20 text-primary-foreground',
                  !active && done && 'bg-[color:var(--success)] text-white',
                  !active && !done && 'bg-border text-muted-foreground',
                )}
              >
                {done ? <LuCheck className="size-2.5" aria-hidden /> : i + 1}
              </span>
              {stageLabel(s)}
            </div>
            {i < STAGE_ORDER.length - 1 && <span className="h-px w-3 shrink-0 bg-border" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

/* ── Tab bar — mirror του idiom στο program-editor.tsx (pill row, navy
 * active, χωρίς Tabs primitive). ── */
type TabKey = 'assessment' | 'obligations' | 'expenses' | 'deliverables' | 'certification' | 'docrequests' | 'payments' | 'opske'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'assessment', label: 'Αξιολόγηση' },
  { key: 'obligations', label: 'Εργασίες & Υποχρεώσεις' },
  { key: 'expenses', label: 'Δαπάνες & Πλάνο' },
  { key: 'deliverables', label: 'Παραδοτέα' },
  { key: 'certification', label: 'Πιστοποίηση' },
  { key: 'docrequests', label: 'Αιτήματα εγγράφων' },
  { key: 'payments', label: 'Αποπληρωμές' },
  { key: 'opske', label: 'ΟΠΣΚΕ' },
]

function TabBar({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <div role="tablist" aria-label="Ενότητες έργου" className="glass flex flex-wrap gap-1 rounded-full p-1.5">
      {TABS.map(t => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'rounded-full px-4 py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
            active === t.key
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
