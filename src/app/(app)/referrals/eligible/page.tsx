import { requirePermission } from '@/lib/rbac-server'
import { PageHeader } from '@/components/ui/page-header'
import { listEligibleReferralCompanies } from '@/lib/referrals/actions'
import { EligibleReferralsTable } from './eligible-table'

/**
 * «Επιλέξιμοι ανά παραπομπή» — όλες οι επιλέξιμες εταιρίες που προέκυψαν από τη
 * χαρτογράφηση παραπομπών και δεν έχουν αναχθεί ακόμη. Ο διαχειριστής επιλέγει
 * όποιον θέλει, ανά πρόγραμμα, και δημιουργεί δυνητικό πελάτη (χωρίς
 * διπλοεγγραφή — μέσω ΑΦΜ).
 */
export default async function EligibleReferralsPage() {
  await requirePermission('programs.manage')
  const { rows, referrers } = await listEligibleReferralCompanies()

  return (
    <div>
      <PageHeader
        breadcrumb={<>Συναλλασσόμενοι <span aria-hidden>›</span> Χαρτογράφηση παραπομπών <span aria-hidden>›</span></>}
        title="Επιλέξιμοι ανά παραπομπή"
        subtitle="Επίλεξε εταιρίες ανά πρόγραμμα και δημιούργησε δυνητικό πελάτη — χωρίς διπλοεγγραφή μέσω ΑΦΜ."
      />
      <EligibleReferralsTable rows={rows} referrers={referrers} />
    </div>
  )
}
