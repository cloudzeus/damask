'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreVertical, ClipboardCheck, ExternalLink, Users, UserCog, LoaderCircle, CircleCheck, CircleX } from 'lucide-react'
import { stageLabel, type StageStr } from '@/lib/pm/types'
import type { VisibleApplicationItem } from '@/lib/pm/actions'
import { reevaluateApplication } from '@/lib/pm/program-link'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * «Έργα» — DataTable αιτήσεων/έργων. 'use client' (cell render fns + inline
 * ενέργειες). Στάδιο & αξιολόγηση ως χρωματιστά badges· dropdown ενεργειών ανά
 * γραμμή (αξιολόγηση εταιρίας / άνοιγμα έργου / επαφές / ανάθεση).
 */

// Στάδιο (ApplicationStage) → badge variant από την παλέτα μας.
const STAGE_VARIANT: Record<StageStr, string> = {
  ASSESSMENT: 'info',
  DOCUMENTS: 'violet',
  EXPENSES_DELIVERABLES: 'teal',
  OPSKE_SUBMISSION: 'warn',
  INSPECTION: 'ok',
  MONITORING: 'muted',
}

function StageBadge({ stage }: { stage: StageStr }) {
  return <span className={`badge-pill ${STAGE_VARIANT[stage] ?? 'muted'}`}>{stageLabel(stage)}</span>
}

/** Αξιολόγηση επιλεξιμότητας (eligibilitySnapshot.eligible) — όχι το PM assessmentVerdict. */
function EligibilityBadge({ eligible }: { eligible: boolean | null }) {
  if (eligible === null) return <span className="badge-pill muted">Χωρίς αξιολόγηση</span>
  if (eligible) return <span className="badge-pill ok"><CircleCheck className="size-3" aria-hidden /> Πληροί</span>
  return (
    <span className="badge-pill" style={{ color: 'var(--card)', background: 'var(--coral)' }}>
      <CircleX className="size-3" aria-hidden /> Δεν πληροί
    </span>
  )
}

export function ApplicationsTable({ rows, fillHeight = false, canManage = false }: { rows: VisibleApplicationItem[]; fillHeight?: boolean; canManage?: boolean }) {
  const router = useRouter()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  function evaluate(row: VisibleApplicationItem) {
    setBusyId(row.id)
    reevaluateApplication(row.id)
      .then(r => { toast.success(r.eligible ? 'Πληροί τα κριτήρια.' : 'Δεν πληροί όλα τα κριτήρια.'); router.refresh() })
      .catch(err => toast.error(err instanceof Error ? err.message : 'Η αξιολόγηση απέτυχε.'))
      .finally(() => setBusyId(null))
  }

  const columns: DataTableColumn<VisibleApplicationItem>[] = [
    {
      id: 'trdr',
      header: 'Πελάτης',
      width: 230,
      enableHide: false,
      sortValue: r => r.trdrName,
      cell: r => (
        <Link href={`/programs/${r.programId}/applications/${r.id}`} className="font-semibold hover:underline">
          {r.trdrName}
        </Link>
      ),
    },
    { id: 'program', header: 'Πρόγραμμα', width: 250, sortValue: r => r.programTitle, cell: r => r.programTitle },
    { id: 'stage', header: 'Στάδιο', width: 160, sortValue: r => stageLabel(r.stage), cell: r => <StageBadge stage={r.stage} /> },
    {
      id: 'eligibility',
      header: 'Αξιολόγηση',
      width: 150,
      sortValue: r => (r.eligible === null ? 0 : r.eligible ? 2 : 1),
      cell: r => <EligibilityBadge eligible={r.eligible} />,
    },
    {
      id: 'manager',
      header: 'Διαχειριστής',
      width: 160,
      sortValue: r => r.managerName ?? '',
      cell: r => <span className="text-muted-foreground">{r.managerName ?? '—'}</span>,
    },
    {
      id: 'actions',
      header: '⋯',
      headerLabel: 'Ενέργειες',
      align: 'center',
      width: 72,
      enableHide: false,
      enableResize: false,
      cell: r => {
        const busy = busyId === r.id
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Ενέργειες"
                  className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  disabled={busy}
                >
                  {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
                </button>
              }
            />
            <DropdownMenuContent align="end">
              {canManage && (
                <DropdownMenuItem onClick={() => evaluate(r)}>
                  <ClipboardCheck className="size-3.5" aria-hidden /> Αξιολόγηση εταιρίας
                </DropdownMenuItem>
              )}
              <DropdownMenuItem render={<Link href={`/programs/${r.programId}/applications/${r.id}`} />}>
                <ExternalLink className="size-3.5" aria-hidden /> Άνοιγμα έργου
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/programs/${r.programId}/applications/${r.id}?tab=contacts`} />}>
                <Users className="size-3.5" aria-hidden /> Επαφές έργου
              </DropdownMenuItem>
              {canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem render={<Link href="/assignments" />}>
                    <UserCog className="size-3.5" aria-hidden /> Ανάθεση
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <DataTable
      tableId="pm-applications"
      columns={columns}
      rows={rows}
      rowKey={r => r.id}
      emptyMessage="Δεν υπάρχουν έργα."
      fillHeight={fillHeight}
    />
  )
}
