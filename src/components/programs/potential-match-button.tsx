'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { LoaderCircle, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { runPotentialMatchingAction } from '@/lib/pm/potential-actions'
import type { MatchRunResult } from '@/lib/pm/potential-matching'

/** «Έλεγχος δυνητικών»: όλοι οι πελάτες × ενεργά/αναμενόμενα προγράμματα (περιφέρεια, ΚΑΔ, νομική μορφή). */
export function PotentialMatchButton() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<MatchRunResult | null>(null)
  return (
    <>
      <Button type="button" variant="outline" disabled={pending}
        title="Βασικός έλεγχος σε ποια ενεργά/αναμενόμενα προγράμματα ταιριάζει κάθε πελάτης (περιφέρεια, ΚΑΔ, νομική μορφή)"
        onClick={() => start(async () => {
          const r = await runPotentialMatchingAction().catch(() => ({ ok: false as const, error: 'Ο έλεγχος απέτυχε.' }))
          if (!r.ok || !('result' in r) || !r.result) { toast.error(r.error ?? 'Ο έλεγχος απέτυχε.'); return }
          setResult(r.result)
        })}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <UsersRound className="size-4" />} {pending ? 'Έλεγχος πελατών…' : 'Έλεγχος δυνητικών πελατών'}
      </Button>
      <Dialog open={!!result} onOpenChange={o => { if (!o) setResult(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Δυνητικά προγράμματα πελατών</DialogTitle>
            <DialogDescription>
              {result && <>Ελέγχθηκαν <b>{result.customers.toLocaleString('el-GR')}</b> πελάτες σε <b>{result.programs}</b> ενεργά/αναμενόμενα προγράμματα (περιφέρεια, ΚΑΔ, νομική μορφή). Τα αποτελέσματα εμφανίζονται στην καρτέλα κάθε πελάτη, στο tab «Δυνητικά προγράμματα».</>}
            </DialogDescription>
          </DialogHeader>
          {result && (
            <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
              <table className="w-full text-[length:var(--fs-13)]">
                <thead className="sticky top-0 bg-muted text-left"><tr><th className="p-2">Πρόγραμμα</th><th className="w-28 p-2 text-right">Πελάτες</th></tr></thead>
                <tbody>
                  {[...result.byProgram].sort((a, b) => b.matches - a.matches).map(p => (
                    <tr key={p.programId} className="border-t">
                      <td className="p-2"><a className="hover:underline" href={`/programs/${p.programId}`}>{p.title}</a></td>
                      <td className="p-2 text-right tabular-nums font-semibold">{p.matches.toLocaleString('el-GR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[length:var(--fs-12)] text-muted-foreground">Πολύ μεγάλοι αριθμοί σημαίνουν συνήθως ότι στο πρόγραμμα δεν έχουν καταχωριστεί επιλέξιμοι ΚΑΔ ή περιφέρειες — συμπληρώστε τους για ακριβέστερο έλεγχο.</p>
          <DialogFooter><DialogClose render={<Button type="button">Κλείσιμο</Button>} /></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
