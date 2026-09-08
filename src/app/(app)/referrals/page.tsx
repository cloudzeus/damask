import { requirePermission } from '@/lib/rbac-server'
import { PageHeader } from '@/components/ui/page-header'
import { listReferrerOptions, listActiveProgramTitles } from '@/lib/referrals/actions'
import { ReferralsTool } from './referrals-tool'

/**
 * «Χαρτογράφηση παραπομπών» — εργαλείο: ο διαχειριστής ανεβάζει Excel με ΑΦΜ
 * (+τηλέφωνο/email), επιλέγει εταιρία παραπομπής, και το σύστημα βρίσκει μέσω
 * ΑΑΔΕ τους ΚΑΔ + Περιφέρεια (best-effort από ΤΚ), ελέγχει επιλεξιμότητα στα
 * ενεργά προγράμματα, και αποθηκεύει το αποτέλεσμα ανά εταιρία παραπομπής.
 * Ξεχωρίζει όσους είναι ΗΔΗ πελάτες (μέσω ΑΦΜ) για αποφυγή διπλοεγγραφής.
 */
export default async function ReferralsPage() {
  await requirePermission('programs.manage')
  const [referrers, programs] = await Promise.all([listReferrerOptions(), listActiveProgramTitles()])

  return (
    <div>
      <PageHeader
        breadcrumb={<>Συναλλασσόμενοι <span aria-hidden>›</span></>}
        title="Χαρτογράφηση παραπομπών"
        subtitle="Ανέβασε Excel με ΑΦΜ πελατών μιας εταιρίας παραπομπής — έλεγχος επιλεξιμότητας σε όλα τα ενεργά προγράμματα."
      />
      <ReferralsTool referrers={referrers} programs={programs} />
    </div>
  )
}
