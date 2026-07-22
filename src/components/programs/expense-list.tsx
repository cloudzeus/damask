'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LuPlus, LuSparkles, LuLoaderCircle, LuCircleCheck, LuRotateCw } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  listApplicationExpenses, suggestExpenseCategory, confirmExpenseCategory, suggestAllExpenses,
  type ProgramExpenseItem, type ExpenseCategoryOption,
} from '@/lib/programs/actions'
import { NewExpenseDialog } from './new-expense-dialog'

const LOW_CONFIDENCE_THRESHOLD = 0.5
const SUGGEST_ALL_START_PCT = 15
const SUGGEST_ALL_CAP_PCT = 92
const SUGGEST_ALL_TICK_MS = 900

function formatEUR(v: number): string {
  return `${v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('el-GR')
}

function formatConfidence(v: number | null): string {
  return v == null ? '' : ` (${Math.round(v * 100)}%)`
}

/**
 * Πίνακας δαπανών μιας αίτησης (Task 15 — payoff του C3): κάθε δαπάνη
 * δείχνει το AI suggestion (κατηγορία + λόγος στο tooltip + κόκκινη
 * («coral») ένδειξη όταν confidence < 0.5) και ένα inline confirm
 * `<select>` προεπιλεγμένο στην πρόταση. Confirmed δαπάνες δείχνουν μόνο ✓
 * + το όνομα της επιβεβαιωμένης κατηγορίας (καμία περαιτέρω αλλαγή εδώ —
 * ταιριάζει με το confirmExpenseCategory idiom, one-way confirm).
 * Self-fetching client component (mirror FinancialsTab) — φορτώνει με
 * listApplicationExpenses στο mount, refresh μετά από κάθε mutation.
 */
export function ExpenseList({ applicationId, categories }: { applicationId: string; categories: ExpenseCategoryOption[] }) {
  const [expenses, setExpenses] = useState<ProgramExpenseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set())
  const [suggestingIds, setSuggestingIds] = useState<Set<string>>(new Set())

  const [suggestingAll, setSuggestingAll] = useState(false)
  const [suggestAllProgress, setSuggestAllProgress] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const categoryName = useCallback(
    (id: string | null) => (id ? (categories.find(c => c.id === id)?.name ?? '—') : null),
    [categories],
  )

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    listApplicationExpenses(applicationId)
      .then(setExpenses)
      .catch(() => setError('Η φόρτωση των δαπανών απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!suggestingAll || suggestAllProgress < SUGGEST_ALL_START_PCT) return
    tickRef.current = setInterval(() => {
      setSuggestAllProgress(p => (p < SUGGEST_ALL_CAP_PCT ? p + 1 : p))
    }, SUGGEST_ALL_TICK_MS)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [suggestingAll, suggestAllProgress])

  function markSuggesting(id: string, on: boolean) {
    setSuggestingIds(prev => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  function markConfirming(id: string, on: boolean) {
    setConfirmingIds(prev => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  async function handleNewExpenseCreated(expenseId: string) {
    load()
    markSuggesting(expenseId, true)
    try {
      await suggestExpenseCategory(expenseId)
    } catch {
      toast.error('Η αυτόματη πρόταση κατηγορίας απέτυχε για τη νέα δαπάνη.')
    } finally {
      markSuggesting(expenseId, false)
      load()
    }
  }

  async function handleRetrySuggestion(expenseId: string) {
    markSuggesting(expenseId, true)
    try {
      await suggestExpenseCategory(expenseId)
      load()
    } catch {
      toast.error('Η πρόταση κατηγορίας απέτυχε.')
    } finally {
      markSuggesting(expenseId, false)
    }
  }

  async function handleConfirm(expense: ProgramExpenseItem) {
    const categoryId = selection[expense.id] ?? expense.suggestedCategoryId ?? ''
    if (!categoryId) {
      toast.error('Επίλεξε πρώτα κατηγορία.')
      return
    }
    markConfirming(expense.id, true)
    try {
      await confirmExpenseCategory(expense.id, categoryId)
      toast.success('Η κατηγορία επιβεβαιώθηκε.')
      load()
    } catch {
      toast.error('Η επιβεβαίωση απέτυχε.')
    } finally {
      markConfirming(expense.id, false)
    }
  }

  async function handleSuggestAll() {
    const pending = expenses.filter(e => !e.confirmed).length
    if (pending === 0) {
      toast.error('Δεν υπάρχουν μη-επιβεβαιωμένες δαπάνες.')
      return
    }
    setSuggestingAll(true)
    setSuggestAllProgress(5)
    try {
      const { suggested } = await suggestAllExpenses(applicationId)
      setSuggestAllProgress(100)
      toast.success(`Προτάθηκε κατηγορία για ${suggested} δαπάνες.`)
      load()
    } catch {
      toast.error('Η μαζική πρόταση κατηγοριών απέτυχε.')
    } finally {
      setSuggestingAll(false)
      setSuggestAllProgress(0)
    }
  }

  const pendingCount = expenses.filter(e => !e.confirmed).length

  return (
    <div className="flex flex-col gap-2.5 border-t border-dashed border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] text-muted-foreground">
          {expenses.length} δαπάνες{pendingCount > 0 ? ` — ${pendingCount} προς επιβεβαίωση` : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleSuggestAll} disabled={suggestingAll || pendingCount === 0}>
            <LuSparkles className={cnSpin(suggestingAll)} aria-hidden /> Πρόταση για όλες
          </Button>
          <Button type="button" size="sm" onClick={() => setNewOpen(true)}>
            <LuPlus className="size-3.5" aria-hidden /> Νέα δαπάνη
          </Button>
        </div>
      </div>

      {suggestingAll && (
        <div className="flex flex-col gap-1">
          <Progress value={suggestAllProgress} />
          <p className="text-center text-[11px] text-muted-foreground">Πρόταση κατηγοριών με DeepSeek…</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : expenses.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-muted-foreground">Δεν έχουν καταχωριστεί δαπάνες ακόμη.</p>
      ) : (
        <div className="rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Περιγραφή</TableHead>
                <TableHead className="text-right">Ποσό</TableHead>
                <TableHead>Ημ/νία</TableHead>
                <TableHead>Προμηθευτής</TableHead>
                <TableHead>Κατηγορία (AI πρόταση)</TableHead>
                <TableHead className="text-right">Ενέργεια</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-normal">{e.description}</TableCell>
                  <TableCell className="text-right font-mono">{formatEUR(e.amount)}</TableCell>
                  <TableCell>{formatDate(e.date)}</TableCell>
                  <TableCell>{e.vendor ?? '—'}</TableCell>
                  <TableCell>
                    {e.confirmed ? (
                      <Badge variant="outline" className="gap-1 text-success">
                        <LuCircleCheck className="size-3" aria-hidden /> {categoryName(e.categoryId) ?? '—'}
                      </Badge>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {suggestingIds.has(e.id) ? (
                          <Badge variant="outline" className="gap-1 text-muted-foreground">
                            <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> Πρόταση σε εξέλιξη…
                          </Badge>
                        ) : e.suggestedCategoryId ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Badge
                                  variant="outline"
                                  className="w-fit cursor-default gap-1"
                                  style={
                                    e.suggestionConfidence != null && e.suggestionConfidence < LOW_CONFIDENCE_THRESHOLD
                                      ? { color: 'var(--coral)', borderColor: 'var(--coral)', background: 'var(--coral-soft)' }
                                      : undefined
                                  }
                                >
                                  <LuSparkles className="size-3" aria-hidden />
                                  {categoryName(e.suggestedCategoryId)}{formatConfidence(e.suggestionConfidence)}
                                </Badge>
                              }
                            />
                            <TooltipContent>{e.suggestionReason ?? 'Χωρίς αιτιολόγηση.'}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11.5px] text-muted-foreground">Χωρίς πρόταση</span>
                            <Button type="button" variant="ghost" size="icon-sm" title="Ξανά πρόταση" onClick={() => handleRetrySuggestion(e.id)}>
                              <LuRotateCw className="size-3.5" aria-hidden />
                            </Button>
                          </div>
                        )}

                        {categories.length > 0 && (
                          <Select
                            value={selection[e.id] ?? e.suggestedCategoryId ?? undefined}
                            onValueChange={v => setSelection(prev => ({ ...prev, [e.id]: v ?? '' }))}
                          >
                            <SelectTrigger size="sm" aria-label="Κατηγορία δαπάνης" className="w-full">
                              <SelectValue placeholder="Επιλογή κατηγορίας" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!e.confirmed && (
                      <Button
                        type="button" size="sm"
                        onClick={() => handleConfirm(e)}
                        disabled={confirmingIds.has(e.id) || categories.length === 0}
                      >
                        {confirmingIds.has(e.id) ? 'Επιβεβαίωση…' : 'Επιβεβαίωση'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NewExpenseDialog applicationId={applicationId} open={newOpen} onOpenChange={setNewOpen} onCreated={handleNewExpenseCreated} />
    </div>
  )
}

function cnSpin(spinning: boolean): string {
  return spinning ? 'size-3.5 animate-spin' : 'size-3.5'
}
